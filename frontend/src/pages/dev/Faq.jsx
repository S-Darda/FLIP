import { Panel } from '../../components/ui'

const FAQS = [
  ['Which mode should I pick?', 'Federated AutoML when several organisations hold data. Local AutoML when one site trains alone (private, but not federated). Simulation only for demos: it uses synthetic data.'],
  ['Does my raw data leave the site?', 'No. Site agents read data locally and send only feature counts and sums, model updates and aggregate metrics. Updates and the final model can still leak some information, so use differential privacy for sensitive data.'],
  ['What does the privacy budget mean?', 'ε measures how much any one site can affect the released models; smaller is stronger. The budget caps the total across every run and AutoML trial of the study.'],
  ['How does AutoML choose a model?', 'Each trial varies the model family, learning rate and local epochs. The winner is picked on validation data; the test split is only used for the final report.'],
  ['Can I edit a study later?', 'Description and objectives, yes. Changing sites, features, target or policy on an approved study sends it back for review.'],
  ['Where is the report?', 'Every completed run has a report page with a formatted PDF: figures, narrative text, your discussion notes and reviewer comments.'],
]

export default function Faq() {
  return (
    <Panel title="FAQ" className="faq">
      {FAQS.map(([q, a]) => (
        <details key={q}>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      ))}
    </Panel>
  )
}

export function ProjectTabs() {
  return null
}
