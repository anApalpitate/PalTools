import { memo } from 'react'
import type { KnowledgeEvidence, LocalToolTrace } from '../../domain/knowledge-contract'
import { localAssetUrl } from '../../lib/assets'

interface AssistantEvidenceProps {
  evidence: KnowledgeEvidence[]
  traces: LocalToolTrace[]
}

export const AssistantEvidence = memo(function AssistantEvidence({ evidence, traces }: AssistantEvidenceProps) {
  return (
    <>
      {traces.length > 0 && <ol className="assistant-trace-list">{traces.map((trace, index) => <li key={`${trace.tool}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{trace.label}</strong><small>{traceSourceLabel(trace.source)}命中 {trace.resultCount} 条 · {trace.durationMs} ms</small></div></li>)}</ol>}
      <div className="assistant-evidence-list">{evidence.map((item, index) => <EvidenceCard key={item.id} item={item} index={index + 1} />)}{evidence.length === 0 && <p className="assistant-evidence-empty">选择一条助手回答后，这里会显示实际使用的本地记录。</p>}</div>
    </>
  )
})

function EvidenceCard({ item, index }: { item: KnowledgeEvidence; index: number }) {
  const body = <><span className="assistant-evidence-number">{String(index).padStart(2, '0')}</span>{item.imagePath && <img src={localAssetUrl(item.imagePath)} alt="" width="42" height="42" loading="lazy" />}<div><small>{item.kind.toUpperCase()} · {item.datasetVersion}</small><strong>{item.title}</strong><p>{item.summary}</p></div></>
  return item.route ? <a className="assistant-evidence-card" href={item.route}>{body}<span className="assistant-evidence-arrow" aria-hidden="true">→</span></a> : <article className="assistant-evidence-card">{body}</article>
}

function traceSourceLabel(source?: LocalToolTrace['source']): string {
  if (source === 'mention') return '用户指定 · '
  if (source === 'model') return '模型调用 · '
  return '自动检索 · '
}
