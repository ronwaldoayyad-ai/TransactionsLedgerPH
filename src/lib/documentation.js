export const documentSlug=text=>String(text).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
export function parseDocumentation(markdown){
 const lines=String(markdown).replace(/\r/g,'').split('\n'),blocks=[];let i=0
 const tableCells=line=>line.trim().replace(/^\||\|$/g,'').split('|').map(s=>s.trim())
 while(i<lines.length){const line=lines[i].trim();if(!line){i++;continue}
  const diagram=line.match(/^\[diagram:([a-z]+)\]$/);if(diagram){blocks.push({type:'diagram',id:diagram[1]});i++;continue}
  const heading=line.match(/^(#{1,4})\s+(.+)$/);if(heading){blocks.push({type:'heading',level:heading[1].length,text:heading[2]});i++;continue}
  if(/^(```|~~~)/.test(line)){const fence=line.slice(0,3),language=line.slice(3).trim(),text=[];i++;while(i<lines.length&&!lines[i].trim().startsWith(fence))text.push(lines[i++]);i++;blocks.push({type:'code',language,text:text.join('\n')});continue}
  if(line.startsWith('|')&&/^\|?\s*:?-/.test(lines[i+1]?.trim()||'')){const headers=tableCells(line),rows=[];i+=2;while(i<lines.length&&lines[i].trim().startsWith('|'))rows.push(tableCells(lines[i++]));blocks.push({type:'table',headers,rows});continue}
  if(/^[-*]\s+/.test(line)||/^\d+\.\s+/.test(line)){const ordered=/^\d/.test(line),items=[];while(i<lines.length&&(ordered?/^\d+\.\s+/:/^[-*]\s+/).test(lines[i].trim()))items.push(lines[i++].trim().replace(ordered?/^\d+\.\s+/:/^[-*]\s+/,''));blocks.push({type:'list',ordered,items});continue}
  const text=[line];i++;while(i<lines.length&&lines[i].trim()&&!/^(#|[-*] |\d+\. |\[diagram:|\||```|~~~)/.test(lines[i].trim()))text.push(lines[i++].trim());blocks.push({type:'paragraph',text:text.join(' ')})
 }
 return blocks
}
export function safeDocumentationLink(href){return /^https:\/\//i.test(href)||/^\/(privacy|terms)(?:#[a-z0-9-]+)?$/.test(href)||/^#[a-z0-9-]+$/.test(href)}
export function legalMarkdown(title,sections,updated){return '# '+title+'\n\nPolicy updated '+updated+'. This is the same policy source used by the public and borrower views.\n\n'+sections.map((s,i)=>'## '+(i+1)+'. '+s.title+'\n\n'+[s.text,s.intro,...(s.paragraphs||[]),...(s.items||[]).map(x=>'- '+x),s.link?'['+s.link.label+']('+s.link.url+')':null].filter(Boolean).join('\n\n')).join('\n\n')}
export function filterDocumentation(sections,query,extras={}){const q=query.trim().toLowerCase();return q?sections.filter(s=>[s.title,s.summary,s.markdown,extras[s.id]||''].join(' ').toLowerCase().includes(q)):sections}
export function documentationExport(sections,inventory,diagrams){
 const escape=value=>String(value??'').replace(/\|/g,'\\|').replace(/\n/g,' ')
 const table=(headers,rows)=>'| '+headers.map(escape).join(' | ')+' |\n| '+headers.map(()=>'---').join(' | ')+' |\n'+rows.map(r=>'| '+r.map(escape).join(' | ')+' |').join('\n')
 const schema=()=>inventory.schema.tables.map(t=>'### '+t.name+'\n\nRLS: '+(t.rls?'enabled':'disabled')+'. '+(t.primary_key||'No primary key in snapshot')+'\n\n'+table(['Column','Type','Nullable'],t.columns.map(c=>[c.name,c.type,c.nullable?'Yes':'No']))+'\n\n'+(t.foreign_keys||[]).map(f=>'- '+f.definition).join('\n')+'\n\n'+(t.policies||[]).map(p=>'- Policy '+p.name+': '+p.command+' ('+p.roles.join(', ')+')').join('\n')).join('\n\n')
 const revision='# LoanLedger PH — Documentation\n\nBuild fingerprint: '+inventory.fingerprint+'\nGenerated: '+inventory.generatedAt+'\nSchema capture: '+inventory.schema.captured_at+'\n\n'
 const generated=id=>{
  if(id==='schema')return '\n\n'+schema()+'\n\n## Storage buckets\n\n'+table(['Bucket','Public','Limit (bytes)','Allowed types'],inventory.schema.storage_buckets.map(b=>[b.name,b.public?'Yes':'No',b.file_size_limit||'Unspecified',(b.allowed_mime_types||[]).join(', ')]))+'\n\nRealtime publication: '+inventory.schema.realtime_tables.join(', ')+'\n\nMigration source history:\n'+inventory.migrations.map(m=>'- '+m).join('\n')
  if(id==='technical')return '\n\n## Registered routes\n\n'+inventory.routes.map(p=>'- '+p).join('\n')+'\n\nNew borrower screen states: '+inventory.borrowerPages.join(', ')
  if(id==='srs')return '\n\n## Current packages\n\n'+table(['Package','Declared version'],Object.entries(inventory.packages))+'\n\nConfiguration names (no values): '+inventory.envNames.join(', ')
  if(id==='theme')return '\n\n## Current source tokens\n\n'+table(['Admin token','Value'],inventory.adminColors.map(c=>[c.name,c.value]))+'\n\n'+table(['Borrower token','Value'],Object.entries(inventory.borrowerColors))
  if(id==='testing')return '\n\n## Unit suites\n'+inventory.unitFiles.map(f=>'- '+f).join('\n')+'\n\n## Integration suites\n'+inventory.integrationFiles.map(f=>'- '+f).join('\n')
  return ''
 }
 return revision+sections.map(s=>s.markdown.replace(/\[diagram:([a-z]+)\]/g,(_,id)=>{const d=diagrams[id];return d?'~~~mermaid\nflowchart LR\n'+d.nodes.map(n=>'  '+n.id+'["'+n.label.join(' ')+'"]').join('\n')+'\n'+d.edges.map(([a,b])=>'  '+a+' --> '+b).join('\n')+'\n~~~':''})+generated(s.id)).join('\n\n---\n\n')
}
