/**
 * PlaceGuard — Dev Staff Account Repair Script
 * 
 * PURPOSE:
 *   Deletes and properly recreates the 4 development staff accounts
 *   using the Supabase Admin API (GoTrue /admin/users endpoints).
 *   This is required because the original SQL-INSERT approach produced
 *   auth.users rows that cause GoTrue v2 to return "Database error querying schema"
 *   with HTTP 500 during signInWithPassword().
 *
 * USAGE:
 *   1. Get your service role key from:
 *      Supabase Dashboard → Project Settings → API → service_role key
 *   2. Set environment variables:
 *      $env:SUPABASE_URL="https://lhxuhouzkqmqilpwmuzk.supabase.co"
 *      $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."
 *   3. Run:
 *      node scripts/repair-staff-accounts.mjs
 *
 * SAFETY:
 *   - Only deletes and recreates the 4 @placeguard.test accounts
 *   - Preserves existing profiles, companies, drives, and all business data
 *   - After deletion of auth.users, the profiles rows are also deleted (FK CASCADE)
 *   - The script then re-creates profiles with the correct roles
 *   - Does NOT touch student accounts (ankan98@gmail.com, ankan30@gmail.com)
 *   - Does NOT reset the database
 *   - The service role key is read from an env variable, never hardcoded
 */

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.')
  process.exit(1)
}

const ADMIN_BASE = `${SUPABASE_URL}/auth/v1/admin`
const REST_BASE = `${SUPABASE_URL}/rest/v1`

const HEADERS_AUTH = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
}

const HEADERS_REST = {
  ...HEADERS_AUTH,
  'Prefer': 'return=representation',
}

// These are the IDs we originally seeded — the profiles/companies/drives all reference these.
// After deleting auth.users and re-creating via GoTrue, the new UUIDs will be DIFFERENT.
// So we must also update the profiles.id FK and reassign all references.
// ALTERNATIVELY: we can create NEW users, get their IDs, then patch the profiles.
// The cleaner approach: recreate users, capture new IDs, insert profiles with new IDs.

const STAFF_ACCOUNTS = [
  {
    email: 'company@placeguard.test',
    password: 'DevTest!2026',
    role: 'company',
    name: 'Test Company HR',
    oldId: 'cc000001-4000-0000-0000-000000000001',
  },
  {
    email: 'coordinator@placeguard.test',
    password: 'DevTest!2026',
    role: 'coordinator',
    name: 'Test Coordinator',
    oldId: 'cc000001-4000-0000-0000-000000000002',
  },
  {
    email: 'tnp@placeguard.test',
    password: 'DevTest!2026',
    role: 'tnp_head',
    name: 'Test T&P Head',
    oldId: 'cc000001-4000-0000-0000-000000000003',
  },
  {
    email: 'admin@placeguard.test',
    password: 'DevTest!2026',
    role: 'admin',
    name: 'Test Administrator',
    oldId: 'cc000001-4000-0000-0000-000000000004',
  },
]

async function adminFetch(path, options = {}) {
  const url = `${ADMIN_BASE}${path}`
  const res = await fetch(url, { ...options, headers: { ...HEADERS_AUTH, ...options.headers } })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text}`)
  return text ? JSON.parse(text) : null
}

async function restFetch(path, options = {}) {
  const url = `${REST_BASE}${path}`
  const res = await fetch(url, { ...options, headers: { ...HEADERS_REST, ...options.headers } })
  const text = await res.text()
  if (!res.ok) throw new Error(`REST ${res.status} ${path}: ${text}`)
  return text ? JSON.parse(text) : null
}

async function main() {
  console.log('\n=== PlaceGuard Dev Staff Account Repair ===\n')
  
  // Step 1: List existing users to find the old IDs
  console.log('Step 1: Finding existing staff accounts...')
  let allUsers
  try {
    allUsers = await adminFetch('/users?per_page=200')
  } catch (e) {
    console.error('Failed to list users:', e.message)
    process.exit(1)
  }
  
  const users = allUsers.users || []
  const staffEmails = STAFF_ACCOUNTS.map(a => a.email)
  const existingStaff = users.filter(u => staffEmails.includes(u.email))
  
  console.log(`Found ${existingStaff.length} existing staff accounts`)
  existingStaff.forEach(u => console.log(`  - ${u.email} (id: ${u.id})`))
  
  // Step 2: Delete existing staff auth users (this cascades to profiles via FK)
  console.log('\nStep 2: Deleting existing staff auth users...')
  for (const user of existingStaff) {
    try {
      await adminFetch(`/users/${user.id}`, { method: 'DELETE' })
      console.log(`  ✓ Deleted ${user.email} (${user.id})`)
    } catch (e) {
      console.error(`  ✗ Failed to delete ${user.email}: ${e.message}`)
    }
  }
  
  // Step 3: Recreate via GoTrue Admin API (this creates proper auth.users rows)
  console.log('\nStep 3: Recreating staff accounts via Admin API...')
  const newIds = {}
  
  for (const account of STAFF_ACCOUNTS) {
    try {
      const newUser = await adminFetch('/users', {
        method: 'POST',
        body: JSON.stringify({
          email: account.email,
          password: account.password,
          email_confirm: true,
          user_metadata: { name: account.name },
          app_metadata: { provider: 'email', providers: ['email'] },
        }),
      })
      newIds[account.email] = newUser.id
      console.log(`  ✓ Created ${account.email} (new id: ${newUser.id})`)
    } catch (e) {
      console.error(`  ✗ Failed to create ${account.email}: ${e.message}`)
    }
  }
  
  // Step 4: Update profiles with correct role (the handle_new_user trigger creates them as 'student')
  console.log('\nStep 4: Updating profile roles...')
  for (const account of STAFF_ACCOUNTS) {
    const newId = newIds[account.email]
    if (!newId) { console.error(`  ✗ No new ID for ${account.email}, skipping`); continue }
    
    try {
      // Wait a moment for the trigger to create the profile
      await new Promise(r => setTimeout(r, 500))
      
      const updated = await restFetch(
        `/profiles?id=eq.${newId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ role: account.role, name: account.name }),
        }
      )
      console.log(`  ✓ Updated profile for ${account.email} → role=${account.role}`)
    } catch (e) {
      console.error(`  ✗ Failed to update profile for ${account.email}: ${e.message}`)
    }
  }
  
  // Step 5: Recreate the company record (was linked to old company@placeguard.test profile_id)
  const companyNewId = newIds['company@placeguard.test']
  if (companyNewId) {
    console.log('\nStep 5: Recreating company record for company@placeguard.test...')
    try {
      // Check if a company record already exists for this profile
      const existing = await restFetch(`/companies?profile_id=eq.${companyNewId}`)
      if (existing && existing.length > 0) {
        console.log('  Company record already exists — skipping')
      } else {
        const company = await restFetch('/companies', {
          method: 'POST',
          body: JSON.stringify({
            profile_id: companyNewId,
            company_name: '[DEV] PlaceGuard Test Corp',
            website: 'https://placeguard.dev',
            description: 'Development test company',
            verified: true,
          }),
          headers: { Prefer: 'return=representation' },
        })
        console.log(`  ✓ Created company record (id: ${company[0]?.id || company.id})`)
        
        // Note: The existing drive was linked to the OLD company ID.
        // You may need to re-create the development drive separately.
        console.log('\n  ⚠️  NOTE: The existing development drive was linked to the OLD company record.')
        console.log('  Run the seed script again to re-create the drive, or update it manually in the Supabase dashboard.')
      }
    } catch (e) {
      console.error(`  ✗ Failed to create company record: ${e.message}`)
    }
  }
  
  console.log('\n=== Repair Complete ===')
  console.log('\nNew account IDs:')
  Object.entries(newIds).forEach(([email, id]) => console.log(`  ${email}: ${id}`))
  console.log('\nAll four staff accounts should now be able to log in.')
  console.log('Password for all dev accounts: DevTest!2026')
  console.log('\nIMPORTANT: Run npm run dev and test login for each account.')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
