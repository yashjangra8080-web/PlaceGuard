// supabase/functions/ai-assistant/index.ts
// PlaceGuard Gemini AI Edge Function
// GEMINI_API_KEY is stored ONLY in Supabase secrets — never in client code
// Every request is authenticated via Supabase JWT

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Gemini client initialised lazily from secret ──────────────────────────────
let genAI: any = null;
async function getGenAI() {
  if (genAI) return genAI;
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY secret is not configured. Contact your T&P administrator.");
  const { GoogleGenAI } = await import("https://esm.sh/@google/genai@1.38.0");
  genAI = new GoogleGenAI({ apiKey: key });
  return genAI;
}

async function generateContent(prompt: string) {
  const ai = await getGenAI();
  const response = await ai.models.generateContent({
    model: Deno.env.get("GEMINI_MODEL") ?? "gemini-3.1-flash-lite",
    contents: prompt,
    config: { responseMimeType: "application/json" },
  });
  if (!response.text) throw new Error("Gemini returned an empty response.");
  return response.text;
}

// ── Auth helper ───────────────────────────────────────────────────────────────
async function getAuthenticatedProfile(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Missing Authorization header");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Invalid or expired session");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, name, email, role, is_active")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) throw new Error("Profile not found");
  if (!profile.is_active) throw new Error("Account is inactive");

  return { profile, supabase };
}

// ── Role guards ───────────────────────────────────────────────────────────────
const STAFF_ROLES = ["company", "coordinator", "tnp_head", "admin"];
const PRIVILEGED_ROLES = ["tnp_head", "admin"];

// ── JSON extractor from Gemini markdown output ────────────────────────────────
function extractJson(text: string): unknown {
  const match = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\[[\s\S]*\]/) || text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[1] ?? match[0]); } catch { /* fall through */ }
  }
  return JSON.parse(text);
}

// ── OPERATION: generate_questions ─────────────────────────────────────────────
async function generateQuestions(payload: any, profile: any) {
  if (!STAFF_ROLES.includes(profile.role)) throw new Error("Not authorized to generate questions");

  const { role, round_type, topic, difficulty, count = 5, skills = [] } = payload;
  const n = Math.min(Math.max(parseInt(count), 1), 20);

  const prompt = `You are an expert technical recruiter designing assessment questions for campus placements.

Generate exactly ${n} multiple-choice questions for the following:

Job Role: ${role}
Round Type: ${round_type}
Topic/Area: ${topic}
Difficulty: ${difficulty}
Required Skills: ${skills.join(", ") || "general"}

Requirements:
- Each question must have exactly 4 options (A, B, C, D)
- Exactly one correct answer per question
- Appropriate for ${difficulty} difficulty level
- Professionally worded, unambiguous
- Include a clear explanation for the correct answer
- Mix different sub-topics within ${topic}

Respond ONLY with a JSON array (no markdown explanation, just the array):
[
  {
    "question_text": "...",
    "question_type": "MCQ_SINGLE",
    "topic": "${topic}",
    "difficulty": "${difficulty}",
    "marks": ${difficulty === "EASY" ? 1 : difficulty === "MEDIUM" ? 2 : 3},
    "explanation": "...",
    "options": [
      {"text": "...", "is_correct": false},
      {"text": "...", "is_correct": true},
      {"text": "...", "is_correct": false},
      {"text": "...", "is_correct": false}
    ]
  }
]`;

  const text = await generateContent(prompt);

  let questions: unknown[];
  try {
    questions = extractJson(text) as unknown[];
  } catch {
    throw new Error("Gemini returned invalid JSON. Please try again.");
  }

  // Validate structure
  if (!Array.isArray(questions)) throw new Error("Expected array of questions from Gemini");
  const validated = questions.slice(0, n).map((q: any, i: number) => {
    if (!q.question_text || !Array.isArray(q.options) || q.options.length < 2) {
      throw new Error(`Question ${i + 1} has invalid structure`);
    }
    const correctCount = q.options.filter((o: any) => o.is_correct).length;
    if (correctCount !== 1) throw new Error(`Question ${i + 1} must have exactly one correct option`);
    return {
      question_text: String(q.question_text).trim(),
      question_type: "MCQ_SINGLE",
      topic: String(q.topic || topic).trim(),
      difficulty: String(q.difficulty || difficulty).toUpperCase(),
      marks: Number(q.marks) || (difficulty === "EASY" ? 1 : difficulty === "MEDIUM" ? 2 : 3),
      explanation: String(q.explanation || "").trim(),
      options: q.options.map((o: any) => ({
        text: String(o.text).trim(),
        is_correct: Boolean(o.is_correct),
      })),
    };
  });

  return { questions: validated, count: validated.length };
}

// ── OPERATION: generate_recruitment_plan ──────────────────────────────────────
async function generateRecruitmentPlan(payload: any, profile: any) {
  if (!["company", "tnp_head", "admin"].includes(profile.role)) {
    throw new Error("Not authorized to generate recruitment plans");
  }

  const { role, skills = [], experience = "Fresher", objective = "", difficulty = "Medium" } = payload;

  const prompt = `You are an expert campus recruitment consultant helping design a structured placement process.

Design a complete recruitment process for:
Job Role: ${role}
Required Skills: ${skills.join(", ")}
Experience Level: ${experience}
Recruitment Objective: ${objective || "Hire top engineering candidates"}
Overall Difficulty: ${difficulty}

Respond ONLY with valid JSON (no markdown, just the object):
{
  "suggested_eligibility": {
    "min_cgpa": 6.5,
    "max_backlogs": 1,
    "allowed_branches": ["CSE", "IT", "ECE"],
    "required_skills": [],
    "notes": "..."
  },
  "recruitment_process": [
    {
      "round_number": 1,
      "name": "...",
      "round_type": "APTITUDE",
      "description": "...",
      "is_elimination": true,
      "duration_minutes": 60,
      "total_questions": 30,
      "difficulty": "MEDIUM",
      "passing_percentage": 60,
      "negative_marking": false,
      "topics": ["Quantitative", "Verbal", "Logical"]
    }
  ],
  "rationale": "Brief explanation of why this process was designed this way",
  "estimated_selection_rate": "5-10%"
}

Round types available: APTITUDE, CODING, SQL_ASSESSMENT, LINUX_ASSESSMENT, CLOUD_ASSESSMENT, TECHNICAL_INTERVIEW, HR_INTERVIEW, ASSESSMENT
Keep between 3-5 rounds total. First round should be broad (aptitude/coding). Final round is typically HR_INTERVIEW.`;

  const text = await generateContent(prompt);

  let plan: unknown;
  try { plan = extractJson(text); } catch {
    throw new Error("Gemini returned invalid plan JSON. Please try again.");
  }

  return { plan, generated_for: role };
}

// ── OPERATION: candidate_analysis ─────────────────────────────────────────────
async function candidateAnalysis(payload: any, profile: any) {
  // Company, coordinator, tnp_head, admin can view; students can view their own
  const { student_name, results } = payload;
  if (!results || !Array.isArray(results)) throw new Error("results array required");

  if (results.length === 0) return { analysis: null, message: "No assessment data available yet." };

  const resultsText = results.map((r: any) =>
    `Round: ${r.round_name} | Score: ${r.total_score}/${r.max_score} (${r.percentage}%) | Passed: ${r.passed} | Topics: ${JSON.stringify(r.section_results ?? [])}`
  ).join("\n");

  const prompt = `You are an expert placement analyst reviewing a candidate's recruitment performance.

Candidate: ${student_name || "Candidate"}
Assessment Results:
${resultsText}

Provide a concise, professional analysis. Respond ONLY with valid JSON:
{
  "overall_score_percentage": 82,
  "performance_tier": "Strong",
  "strongest_areas": ["JavaScript", "Arrays", "SQL"],
  "weakest_areas": ["Graph algorithms", "Dynamic programming"],
  "round_performance": [
    {"round": "Aptitude", "percentage": 84, "assessment": "Above average"}
  ],
  "ai_summary": "2-3 sentence professional summary of the candidate's performance",
  "recommended_preparation": ["Graph traversal", "DP patterns"],
  "hiring_signal": "Positive",
  "disclaimer": "This is an AI-generated analysis based on assessment data. Final hiring decisions are made by the recruitment team."
}

IMPORTANT: Do NOT make final hiring decisions or override official results.
Base your analysis ONLY on the provided data. Do not invent scores or data.`;

  const text = await generateContent(prompt);

  let analysis: unknown;
  try { analysis = extractJson(text); } catch {
    throw new Error("Could not parse AI analysis. Please try again.");
  }

  return { analysis, ai_generated: true, generated_at: new Date().toISOString() };
}

// ── OPERATION: company_recruitment_summary ────────────────────────────────────
async function companyRecruitmentSummary(payload: any, profile: any) {
  if (!["company", "coordinator", "tnp_head", "admin"].includes(profile.role)) {
    throw new Error("Not authorized");
  }

  const { drive_title, funnel, analytics } = payload;
  if (!funnel) throw new Error("funnel data required");

  const funnelText = Object.entries(funnel).map(([k, v]) => `${k}: ${v}`).join(", ");
  const analyticsText = analytics ? JSON.stringify(analytics) : "No analytics available";

  const prompt = `You are a recruitment analytics expert summarizing a campus placement drive.

Drive: ${drive_title}
Recruitment Funnel: ${funnelText}
Assessment Analytics: ${analyticsText}

Provide a professional recruitment summary. Respond ONLY with valid JSON:
{
  "executive_summary": "2-3 sentence overview",
  "funnel_insights": [
    "Insight about each major drop-off point"
  ],
  "top_performing_areas": ["..."],
  "common_weak_areas": ["..."],
  "round_analysis": [
    {"round": "...", "pass_rate": "...", "avg_score": "...", "insight": "..."}
  ],
  "recommendations": ["Actionable recommendations for future drives"],
  "quality_signal": "Excellent/Good/Average/Below Average",
  "disclaimer": "AI-generated summary. Final decisions by placement team."
}

IMPORTANT: Use only the data provided. Do not invent numbers.`;

  const text = await generateContent(prompt);

  let summary: unknown;
  try { summary = extractJson(text); } catch {
    throw new Error("Could not parse AI summary. Please try again.");
  }

  return { summary, ai_generated: true, generated_at: new Date().toISOString() };
}

// ── OPERATION: governance_summary ─────────────────────────────────────────────
async function governanceSummary(payload: any, profile: any) {
  if (!PRIVILEGED_ROLES.includes(profile.role)) throw new Error("Not authorized");

  const { drives, pending_approvals, anomalies, pending_changes } = payload;

  const prompt = `You are a placement governance AI assistant for a T&P (Training and Placement) office.

Current Governance Status:
Active Drives: ${JSON.stringify(drives ?? [])}
Pending Shortlist Proposals: ${pending_approvals ?? 0}
Anomaly Alerts: ${JSON.stringify(anomalies ?? [])}
Pending Admin Change Requests: ${pending_changes ?? 0}

Provide a brief governance summary. Respond ONLY with valid JSON:
{
  "status_overview": "1-2 sentence overall status",
  "key_actions_required": ["Action items for T&P"],
  "risk_flags": ["Any concerns based on the data"],
  "positive_signals": ["Any positive governance signals"],
  "disclaimer": "AI-generated summary. T&P Head remains the governance authority."
}

IMPORTANT: You are advisory only. Do not approve, reject, or override any decisions.`;

  const text = await generateContent(prompt);

  let summary: unknown;
  try { summary = extractJson(text); } catch {
    throw new Error("Could not parse governance summary.");
  }

  return { summary, ai_generated: true, generated_at: new Date().toISOString() };
}

// ── OPERATION: generate_interview_questions ───────────────────────────────────
async function generateInterviewQuestions(payload: any, profile: any) {
  if (!STAFF_ROLES.includes(profile.role)) throw new Error("Not authorized");

  const { role, skills = [], round_type = "TECHNICAL_INTERVIEW", count = 10 } = payload;
  const n = Math.min(Math.max(parseInt(count), 1), 25);

  const prompt = `Generate ${n} interview questions for:
Role: ${role}
Round: ${round_type}
Skills: ${skills.join(", ")}

Respond ONLY with valid JSON array:
[
  {
    "question": "...",
    "category": "Technical/Behavioral/Situational/HR",
    "difficulty": "EASY/MEDIUM/HARD",
    "expected_answer_key": "Key points the evaluator should look for",
    "follow_up": "Optional follow-up question"
  }
]`;

  const text = await generateContent(prompt);

  let questions: unknown[];
  try { questions = extractJson(text) as unknown[]; } catch {
    throw new Error("Could not parse interview questions.");
  }

  return { questions: (questions as any[]).slice(0, n), count: Math.min((questions as any[]).length, n) };
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { profile } = await getAuthenticatedProfile(req);
    const body = await req.json();
    const { operation, payload } = body;

    if (!operation) throw new Error("operation field required");

    let result: unknown;
    switch (operation) {
      case "generate_questions":
        result = await generateQuestions(payload, profile);
        break;
      case "generate_recruitment_plan":
        result = await generateRecruitmentPlan(payload, profile);
        break;
      case "candidate_analysis":
        result = await candidateAnalysis(payload, profile);
        break;
      case "company_recruitment_summary":
        result = await companyRecruitmentSummary(payload, profile);
        break;
      case "governance_summary":
        result = await governanceSummary(payload, profile);
        break;
      case "generate_interview_questions":
        result = await generateInterviewQuestions(payload, profile);
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    return new Response(JSON.stringify({ ok: true, data: result }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const isAuthError = err.message?.includes("authenticated") || err.message?.includes("authorized") || err.message?.includes("session");
    return new Response(
      JSON.stringify({ ok: false, error: err.message ?? "Unknown error" }),
      {
        status: isAuthError ? 401 : 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      }
    );
  }
});
