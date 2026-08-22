const normalize = (value) => String(value || '').trim().toLowerCase()
export function evaluateEligibility(student, rule) {
  const failedRules = []
  if (Number(student.cgpa) < Number(rule.min_cgpa)) failedRules.push(`CGPA ${student.cgpa} is below required minimum ${rule.min_cgpa}.`)
  if (Number(student.backlogs) > Number(rule.max_backlogs)) failedRules.push(`Active backlogs ${student.backlogs} exceed the maximum ${rule.max_backlogs}.`)
  const branches = rule.allowed_branches || []
  if (branches.length && !branches.map(normalize).includes(normalize(student.branch))) failedRules.push(`${student.branch} is not an allowed branch.`)
  const skills = (student.skills || []).map(normalize)
  const missingSkills = (rule.required_skills || []).filter((skill) => !skills.includes(normalize(skill)))
  if (missingSkills.length) failedRules.push(`Missing required skills: ${missingSkills.join(', ')}.`)
  return { eligible: failedRules.length === 0, failedRules, engineVersion: '1.0.0' }
}
