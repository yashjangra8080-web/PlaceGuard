import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  getCompanyRecord,
  getCompanyDrives,
  createDrive,
  createEligibilityRules,
  publishDrive,
} from '../../services/drives'

const DRIVE_STATUS_ACTIONS = {
  draft: 'Publish',
  open: null,
  closed: null,
  locked: null,
  completed: null,
}

export default function CompanyDashboard() {
  const { profile } = useAuth()
  const [company, setCompany] = useState(null)
  const [drives, setDrives] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [publishing, setPublishing] = useState({})
  const [pubError, setPubError] = useState({})

  // New drive form state
  const [form, setForm] = useState({
    title: '', description: '', roleName: '', deadline: '',
    minCgpa: '', maxBacklogs: '0', allowedBranches: '', requiredSkills: '',
  })
  const [formBusy, setFormBusy] = useState(false)
  const [formError, setFormError] = useState(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const companyRecord = await getCompanyRecord(profile.id)
      setCompany(companyRecord)
      if (companyRecord) {
        const drivesData = await getCompanyDrives(companyRecord.id)
        setDrives(drivesData)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let live = true
    loadData().then(() => !live && undefined)
    return () => { live = false }
  }, [profile.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePublish = async (driveId) => {
    setPublishing((p) => ({ ...p, [driveId]: true }))
    setPubError((p) => ({ ...p, [driveId]: null }))
    try {
      await publishDrive(driveId)
      const updated = await getCompanyDrives(company.id)
      setDrives(updated)
    } catch (err) {
      setPubError((p) => ({ ...p, [driveId]: err.message }))
    } finally {
      setPublishing((p) => ({ ...p, [driveId]: false }))
    }
  }

  const handleCreateDrive = async (e) => {
    e.preventDefault()
    setFormBusy(true)
    setFormError(null)
    try {
      const branches = form.allowedBranches.split(',').map((b) => b.trim()).filter(Boolean)
      const skills = form.requiredSkills.split(',').map((s) => s.trim()).filter(Boolean)
      if (branches.length === 0) throw new Error('At least one allowed branch is required.')
      if (!form.deadline) throw new Error('Deadline is required.')

      const newDrive = await createDrive({
        companyId: company.id,
        profileId: profile.id,
        title: form.title,
        description: form.description,
        roleName: form.roleName,
        deadline: new Date(form.deadline).toISOString(),
      })
      await createEligibilityRules(newDrive.id, {
        minCgpa: parseFloat(form.minCgpa),
        maxBacklogs: parseInt(form.maxBacklogs, 10),
        allowedBranches: branches,
        requiredSkills: skills,
      })
      setForm({ title: '', description: '', roleName: '', deadline: '', minCgpa: '', maxBacklogs: '0', allowedBranches: '', requiredSkills: '' })
      setShowForm(false)
      const updated = await getCompanyDrives(company.id)
      setDrives(updated)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setFormBusy(false)
    }
  }

  if (loading) return <div className="page-state">Loading your drives…</div>

  if (!company && !error) {
    return (
      <section>
        <div className="page-header">
          <div><span className="eyebrow">COMPANY PORTAL</span><h2>Drive Overview</h2></div>
        </div>
        <div className="alert warning">
          Your company profile has not been configured. Contact the placement office administrator to set up your company record.
        </div>
      </section>
    )
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <span className="eyebrow">COMPANY PORTAL</span>
          <h2>{company?.company_name || 'Drive Overview'}</h2>
          <p>Manage your placement drives and eligibility rules.</p>
        </div>
        <button className="primary-button" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : '+ New drive'}
        </button>
      </div>

      {error && <div className="alert error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {showForm && (
        <div className="panel" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1.2rem', letterSpacing: '-.03em' }}>Create a new drive</h3>
          <form onSubmit={handleCreateDrive}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
              <div className="form-group">
                <label>Drive title *</label>
                <input required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Software Engineer Campus Hiring" />
              </div>
              <div className="form-group">
                <label>Role name *</label>
                <input required value={form.roleName} onChange={(e) => setForm((f) => ({ ...f, roleName: e.target.value }))} placeholder="e.g. Software Engineer" />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Description</label>
                <textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional description of the role and company" />
              </div>
              <div className="form-group">
                <label>Application deadline *</label>
                <input required type="datetime-local" value={form.deadline} onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Min CGPA *</label>
                <input required type="number" step="0.01" min="0" max="10" value={form.minCgpa} onChange={(e) => setForm((f) => ({ ...f, minCgpa: e.target.value }))} placeholder="e.g. 7.5" />
              </div>
              <div className="form-group">
                <label>Max backlogs allowed *</label>
                <input required type="number" min="0" value={form.maxBacklogs} onChange={(e) => setForm((f) => ({ ...f, maxBacklogs: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Allowed branches * <small>(comma-separated)</small></label>
                <input required value={form.allowedBranches} onChange={(e) => setForm((f) => ({ ...f, allowedBranches: e.target.value }))} placeholder="CSE, IT, ECE" />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Required skills <small>(comma-separated, optional)</small></label>
                <input value={form.requiredSkills} onChange={(e) => setForm((f) => ({ ...f, requiredSkills: e.target.value }))} placeholder="JavaScript, React" />
              </div>
            </div>
            {formError && <div className="alert error" style={{ margin: '.5rem 0' }}>{formError}</div>}
            <div style={{ display: 'flex', gap: '.75rem', marginTop: '.5rem' }}>
              <button className="primary-button" type="submit" disabled={formBusy}>{formBusy ? 'Creating…' : 'Create drive (draft)'}</button>
              <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
            <p style={{ fontSize: '.8rem', color: '#637089', marginTop: '.5rem' }}>
              The drive will be created as a draft. You must publish it to open applications. Eligibility rules are locked on publish.
            </p>
          </form>
        </div>
      )}

      {drives.length === 0 ? (
        <p className="empty-copy">No drives yet. Create your first drive above.</p>
      ) : (
        <div style={{ display: 'grid', gap: '.75rem' }}>
          {drives.map((drive) => {
            const rules = Array.isArray(drive.eligibility_rules)
              ? drive.eligibility_rules[0]
              : drive.eligibility_rules
            return (
              <div className="panel" key={drive.id}>
                <div className="panel-heading">
                  <div>
                    <span className={`badge badge-${drive.status}`}>{drive.status}</span>
                    <h3 style={{ marginBottom: '.2rem' }}>{drive.title}</h3>
                    <span style={{ fontSize: '.85rem', color: '#637089' }}>{drive.role_name} · Deadline: {new Date(drive.deadline).toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexDirection: 'column' }}>
                    {pubError[drive.id] && <span className="inline-error">{pubError[drive.id]}</span>}
                    <div style={{ display: 'flex', gap: '.5rem' }}>
                      {DRIVE_STATUS_ACTIONS[drive.status] && (
                        <button
                          className="primary-button"
                          disabled={publishing[drive.id]}
                          onClick={() => handlePublish(drive.id)}
                        >
                          {publishing[drive.id] ? 'Publishing…' : 'Publish'}
                        </button>
                      )}
                      <Link className="secondary-button" to={`/company/drives/${drive.id}`}>
                        View detail →
                      </Link>
                    </div>
                  </div>
                </div>
                {rules && (
                  <dl className="eligibility-summary" style={{ marginTop: '.75rem' }}>
                    <div><dt>Min CGPA</dt><dd>{rules.min_cgpa}</dd></div>
                    <div><dt>Max Backlogs</dt><dd>{rules.max_backlogs}</dd></div>
                    <div><dt>Branches</dt><dd>{(rules.allowed_branches ?? []).join(', ')}</dd></div>
                  </dl>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
