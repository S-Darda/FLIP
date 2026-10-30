import { Badge } from '../../components/ui'

/** Read-only description of a study's design, shared by the admin review and developer pages. */
export default function StudySummary({ project: p, sites = [] }) {
  const byId = Object.fromEntries(sites.map(s => [s.site_id, s]))
  return (
    <>
      {p.description && <p className="pre">{p.description}</p>}
      <dl className="dl">
        <dt>Mode</dt><dd>{p.mode_label}</dd>
        <dt>Task</dt><dd>{p.task_type}{p.target && <> · target <span className="mono">{p.target}</span></>}</dd>
        {p.mode === 'simulation' ? <><dt>Simulated sites</dt><dd>{p.cohort_size} (synthetic data)</dd></> : <>
          <dt>Dataset</dt><dd className="mono">{p.dataset_name}</dd>
          <dt>Features</dt><dd className="chips">{p.features.map(f => <span key={f} className="chip mono">{f}</span>)}</dd>
          <dt>Sites</dt>
          <dd className="chips">{p.site_ids.map(id => {
            const s = byId[id]
            return <span key={id} className="chip">{s ? s.name : `site #${id}`} {s && <Badge status={s.status === 'Active' ? 'Active' : 'Pending'}>{s.status === 'Active' ? 'online' : 'not enrolled'}</Badge>}</span>
          })}</dd>
          <dt>Minimum cohort</dt><dd>{p.min_sites} site(s) per round</dd>
        </>}
        <dt>Models allowed</dt><dd>{p.family_labels.join(', ')}</dd>
        <dt>AutoML budget</dt><dd>up to {p.max_trials} trial(s) per search</dd>
        <dt>Privacy policy</dt><dd>{p.dp_required ? 'Client-level DP required' : 'DP optional'}{p.max_epsilon ? ` · study budget ε ≤ ${p.max_epsilon}` : ' · no budget limit'}</dd>
        {p.objectives && <><dt>Objectives</dt><dd className="pre">{p.objectives}</dd></>}
      </dl>
    </>
  )
}
