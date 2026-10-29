import { Link } from 'react-router-dom'
import Icon from '../../components/Icon'
import { Badge, Empty, PageHeader } from '../../components/ui'
import { pct } from '../../format'
import { useRealtime } from '../../realtime'

function describe(e, base) {
  switch (e.type) {
    case 'training':
      return {
        icon: 'nodes', tag: e.status,
        text: e.round_metrics
          ? <>Run <Link to={`${base}/training/${e.training_id}`}>#{e.training_id}</Link> finished round {e.current_round}/{e.rounds}: accuracy {pct(e.accuracy)}, loss {e.loss?.toFixed(4)}</>
          : <>Run <Link to={`${base}/training/${e.training_id}`}>#{e.training_id}</Link> is now {e.status.toLowerCase()}{e.accuracy != null && ` (accuracy ${pct(e.accuracy)})`}</>,
      }
    case 'project':
      return { icon: 'project', tag: e.project.status,
               text: <>Project <Link to={`${base}/projects/${e.project.project_id}`}>{e.project.project_name}</Link> is {e.project.status.toLowerCase()}</> }
    case 'submission':
      return { icon: 'model', tag: e.submission.status, text: <>Model “{e.submission.model_name}” is {e.submission.status.toLowerCase()}</> }
    case 'notification':
      return { icon: 'bell', tag: 'info', text: e.notification.message }
    case 'log':
      return { icon: 'logs', tag: e.log.level, text: <><span className="mono small">{e.log.action}</span> {e.log.log_message}</> }
    default:
      return { icon: 'info', tag: 'info', text: e.type }
  }
}

export default function LiveUpdates({ admin }) {
  const { connected, feed, clearFeed } = useRealtime()
  const base = admin ? '/admin' : '/app'
  return (
    <>
      <PageHeader title="Real-Time Updates"
                  subtitle="Events pushed over WebSocket as they happen: project decisions, training rounds, model reviews and audit events."
                  actions={<>
                    <span className={`ws-pill ${connected ? 'on' : ''}`}><span className="dot" /> {connected ? 'Connected' : 'Reconnecting…'}</span>
                    {feed.length > 0 && <button className="btn btn-ghost btn-sm" onClick={clearFeed}>Clear</button>}
                  </>} />
      {feed.length === 0 ? (
        <Empty icon="live" title="Listening for events">
          Keep this page open. Start a training run or approve a project in another tab and events will stream in here.
        </Empty>
      ) : (
        <ul className="feed card">
          {feed.map((e, i) => {
            const d = describe(e, base)
            return (
              <li key={`${e.receivedAt}-${i}`}>
                <span className="feed-icon"><Icon name={d.icon} size={16} /></span>
                <span className="feed-text">{d.text}</span>
                <Badge status={d.tag} />
                <time className="muted small">{new Date(e.receivedAt).toLocaleTimeString()}</time>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
