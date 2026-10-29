import { NavLink } from 'react-router-dom'

const FAQS = [
  ['What is a cohort size?', 'The number of participating nodes (hospitals, banks, labs) that each hold a slice of the data. Every node trains locally and sends back only a model update.'],
  ['How do I apply for project approval?', 'Fill in the Apply for Approval form and press Apply for Approval. An admin reviews it and you are notified the moment they decide.'],
  ['Can I edit my project details later?', 'Yes. Description and objectives can be edited at any time. Changing the name, domain, cohort size or model of an approved project sends it back for review.'],
  ['What happens if my project is rejected?', "You'll see the admin's feedback on the project page. Update the project and save it to resubmit automatically."],
  ['Does my raw data leave my organisation?', 'In this prototype, yes: an uploaded CSV is stored on the FLIP server and split across simulated sites. The target design runs a local agent at each site so raw rows are never uploaded. Until then, do not upload real personal or sensitive data.'],
  ['Which dataset format works for training?', 'A CSV with a header row. Numeric columns become features and the last column is the label (for example yes/no or a class name).'],
]

export function ProjectTabs() {
  return (
    <div className="pill-tabs">
      <NavLink to="/app/apply" className="pill-tab">Apply for Approval</NavLink>
      <NavLink to="/app/projects" end className="pill-tab">Your Projects</NavLink>
    </div>
  )
}

export default function Faq() {
  return (
    <aside className="card faq">
      <h2>FAQs</h2>
      {FAQS.map(([q, a]) => (
        <details key={q}>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      ))}
    </aside>
  )
}
