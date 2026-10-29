import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api'
import Icon from '../../components/Icon'
import { Field, useApi } from '../../components/ui'
import { bytes } from '../../format'
import { useToast } from '../../toast'
import Faq, { ProjectTabs } from './Faq'

export function FilePicker({ files, setFiles, id = 'files' }) {
  const [drag, setDrag] = useState(false)
  const add = list => setFiles(f => [...f, ...Array.from(list)].slice(0, 10))
  return (
    <>
      <label htmlFor={id} className={`dropzone ${drag ? 'drag' : ''}`}
             onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
             onDrop={e => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files) }}>
        <Icon name="upload" size={22} />
        <span><strong>Choose files</strong> or drag them here</span>
        <small className="muted">CSV for training (last column = label). JSON, ZIP or Parquet are stored for reference. Max 50 MB each.</small>
        <small className="upload-warn"><Icon name="warning" size={12} /> Prototype: files are stored on the FLIP server. Do not upload real personal or sensitive data.</small>
        <input id={id} type="file" multiple accept=".csv,.txt,.json,.zip,.parquet" className="sr-only"
               onChange={e => { add(e.target.files); e.target.value = '' }} />
      </label>
      {files.length > 0 && (
        <ul className="file-list">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}><Icon name="file" size={14} /> {f.name} <span className="muted">{bytes(f.size)}</span>
              <button type="button" className="icon-btn" aria-label={`Remove ${f.name}`} onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export default function Apply() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: options } = useApi('/api/projects/options')
  const [form, setForm] = useState({ project_name: '', description: '', objectives: '', domain: 'Healthcare', cohort_size: '4', model_type: 'logreg' })
  const [files, setFiles] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async e => {
    e.preventDefault()
    if (form.project_name.trim().length < 3) return setError('Give the project a name of at least 3 characters.')
    if (form.description.trim().length < 10) return setError('Describe the project in a sentence or two so the admin can assess it.')
    setBusy(true)
    setError('')
    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => fd.append(k, v))
    files.forEach(f => fd.append('files', f))
    try {
      const p = await api('/api/projects', { method: 'POST', form: fd })
      toast('Project submitted. An admin has been notified.', 'success')
      navigate(`/app/projects/${p.project_id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="split">
      <div className="card tinted">
        <ProjectTabs />
        <h1 className="center">Apply for Approval</h1>
        <form onSubmit={submit} className="stack-sm">
          {error && <div className="alert alert-error" role="alert"><Icon name="warning" /><span>{error}</span></div>}
          <Field label="Project name" htmlFor="p-name">
            <input id="p-name" className="input" value={form.project_name} onChange={set('project_name')} placeholder="Enter project name" required />
          </Field>
          <Field label="Project details" htmlFor="p-desc" hint="What will the model do, and who benefits?">
            <textarea id="p-desc" className="input" rows={4} value={form.description} onChange={set('description')} required />
          </Field>
          <Field label="Objectives and success criteria" htmlFor="p-obj">
            <textarea id="p-obj" className="input" rows={2} value={form.objectives} onChange={set('objectives')} placeholder="e.g. Reach 75% accuracy across all sites" />
          </Field>
          <div className="form-grid">
            <Field label="Domain" htmlFor="p-domain">
              <select id="p-domain" className="input" value={form.domain} onChange={set('domain')}>
                {(options?.domains || ['Healthcare']).map(d => <option key={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Cohort size" htmlFor="p-cohort" hint="Participating nodes">
              <select id="p-cohort" className="input" value={form.cohort_size} onChange={set('cohort_size')}>
                {Array.from({ length: 19 }, (_, i) => i + 2).map(n => <option key={n} value={n}>{n} nodes</option>)}
              </select>
            </Field>
          </div>
          <Field label="Model" htmlFor="p-model">
            <select id="p-model" className="input" value={form.model_type} onChange={set('model_type')}>
              {(options?.model_types || [{ value: 'logreg', label: 'Logistic Regression' }]).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
          <Field label="Datasets (optional)">
            <FilePicker files={files} setFiles={setFiles} />
          </Field>
          <div className="center"><button className="btn btn-purple btn-lg" disabled={busy}>{busy ? 'Submitting…' : 'Apply for Approval'}</button></div>
        </form>
      </div>
      <Faq />
    </div>
  )
}
