import {useEffect,useRef,useState} from 'react'
import {clampColumnWidth,gridLayoutKey,moveGridColumn,normalizeGridLayout,readGridLayout,TRANSACTION_GRID_COLUMNS,writeGridLayout} from '../../lib/transactionGridLayout'
import {formatPeso} from '../../lib/amortization'
import {effectiveStatus,STATUS_LABELS} from '../../lib/transactions'
import {presentationFeeKind} from '../../lib/feePresentation'
import {EmptyState,Switch} from '../ui'
import './TransactionGrid.css'

const definitions=Object.fromEntries(TRANSACTION_GRID_COLUMNS.map(column=>[column.key,column]))
const browserStorage=()=>{try{return window.localStorage}catch{return null}}
const grip=<svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true" fill="currentColor">{[3,7,11].flatMap(y=>[3,7].map(x=><circle key={x+'-'+y} cx={x} cy={y} r=".9"/>))}</svg>

export default function TransactionGrid({ownerId,items,total,count,statusCounts,today,query,onQueryChange,hideSettled,onHideSettledChange,onExport,sortKey,sortDir,onSort,renderCell,allSelected,onToggleAll,selected,onToggleOne}){
  const storageKey=gridLayoutKey(ownerId),[layout,setLayout]=useState(()=>readGridLayout(browserStorage(),storageKey))
  const [announcement,setAnnouncement]=useState(''),[storageFailed,setStorageFailed]=useState(false),[dropTarget,setDropTarget]=useState(null)
  const table=useRef(null),columns=useRef({}),resize=useRef(null),drag=useRef(null),frame=useRef(0)
  useEffect(()=>()=>{cancelAnimationFrame(frame.current);resize.current=null},[])
  const totalWidth=42+layout.order.reduce((sum,key)=>sum+layout.widths[key],0)
  const commitLayout=next=>{setLayout(next);setStorageFailed(!writeGridLayout(browserStorage(),storageKey,next))}
  const changeWidth=(key,width)=>commitLayout({...layout,widths:{...layout.widths,[key]:clampColumnWidth(key,width)}})
  const reorder=(source,target)=>{commitLayout(moveGridColumn(layout,source,target));setDropTarget(null);setAnnouncement(definitions[source].label+' column moved.')}
  const startResize=(event,key)=>{
    if(event.button!==0)return;event.preventDefault();event.stopPropagation()
    resize.current={key,x:event.clientX,start:layout.widths[key],width:layout.widths[key],base:totalWidth}
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const previewResize=event=>{
    const active=resize.current;if(!active)return
    active.width=clampColumnWidth(active.key,active.start+event.clientX-active.x)
    if(frame.current)return
    frame.current=requestAnimationFrame(()=>{frame.current=0;const value=resize.current;if(!value)return;columns.current[value.key].style.width=value.width+'px';table.current.style.width=(value.base-value.start+value.width)+'px'})
  }
  const endResize=cancelled=>{
    const active=resize.current;if(!active)return;cancelAnimationFrame(frame.current);frame.current=0;resize.current=null
    columns.current[active.key].style.width=(cancelled?active.start:active.width)+'px'
    table.current.style.width=(active.base-active.start+(cancelled?active.start:active.width))+'px'
    if(!cancelled){changeWidth(active.key,active.width);setAnnouncement(definitions[active.key].label+' width '+active.width+' pixels.')}
  }
  const moveWithKeys=(event,key)=>{
    if(!event.altKey||!['ArrowLeft','ArrowRight'].includes(event.key))return
    event.preventDefault();const index=layout.order.indexOf(key)+(event.key==='ArrowLeft'?-1:1),target=layout.order[index];if(!target)return
    reorder(key,target);requestAnimationFrame(()=>table.current?.querySelector('[data-column-grip="'+key+'"]')?.focus())
  }
  return <section className="transaction-grid hidden md:block" aria-label="All Transactions grid">
    <header className="tg-toolbar">
      <div><div className="tg-title"><h2>All Transactions</h2><span className="tg-count">{count} records</span></div><div className="tg-summary"><span title="Original billed amounts before payments">Billed total <strong>{formatPeso(total)}</strong></span>{Object.entries(statusCounts).map(([status,amount])=><span className={'tg-status-count tg-status-'+status} key={status}>{amount} {STATUS_LABELS[status].toLowerCase()}</span>)}</div></div>
      <div className="tg-tools"><label className="tg-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input type="search" aria-label="Search transactions grid" placeholder="Search borrower or item…" value={query} onChange={event=>onQueryChange(event.target.value)}/></label><button type="button" className="tg-tool-button" onClick={onExport} disabled={!count}>↓ Export</button><label className="tg-show-all"><span>Show all transactions</span><Switch checked={!hideSettled} onChange={value=>onHideSettledChange(!value)} label="Show all transactions in grid"/></label></div>
    </header>
    <div className="tg-help"><span><strong>Interactive grid:</strong> Edit a cell to review a correction. Amount shows the original bill before payments. Drag grips to move columns and edges to resize. <span className="tg-keyboard-hint">Keyboard: Alt + arrows to move; arrows on an edge to resize.</span></span><span className="tg-layout-status">{storageFailed?'Layout kept for this visit':'Layout saved on this device'}<button type="button" onClick={()=>{commitLayout(normalizeGridLayout(null));setAnnouncement('Default column layout restored.')}}>Reset layout</button></span></div>
    <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
    {!items.length?<EmptyState icon="scroll" title="No matching transactions" body="Adjust your filters or search."/>:<div className="tg-scroll" tabIndex={0} role="region" aria-label="Scrollable transactions table"><table ref={table} style={{width:totalWidth}}><colgroup><col style={{width:42}}/>{layout.order.map(key=><col key={key} ref={element=>{columns.current[key]=element}} style={{width:layout.widths[key]}}/>)}</colgroup>
      <thead><tr><th className="tg-check" scope="col"><input type="checkbox" checked={allSelected} onChange={onToggleAll} aria-label="Select all filtered transactions"/></th>{layout.order.map(key=>{const column=definitions[key],sortable=['txnDate','dueDate'].includes(key);return <th key={key} scope="col" data-column={key} className={dropTarget===key?'tg-drop-target':''} aria-sort={sortable?(sortKey===key?(sortDir==='asc'?'ascending':'descending'):'none'):undefined} onDragOver={event=>{if(!drag.current||resize.current)return;event.preventDefault();event.dataTransfer.dropEffect='move';if(dropTarget!==key)setDropTarget(key)}} onDrop={event=>{event.preventDefault();const source=drag.current;if(source&&event.dataTransfer.getData('text/plain')===source)reorder(source,key);drag.current=null;setDropTarget(null)}}>
        <div className="tg-header-content"><button type="button" draggable className="tg-grip" data-column-grip={key} aria-label={'Move '+column.label+' column'} title="Drag to reorder; Alt + Left/Right also moves this column" onKeyDown={event=>moveWithKeys(event,key)} onDragStart={event=>{if(resize.current){event.preventDefault();return}drag.current=key;event.dataTransfer.setData('text/plain',key);event.dataTransfer.effectAllowed='move'}} onDragEnd={()=>{drag.current=null;setDropTarget(null)}}>{grip}</button>{sortable?<button type="button" className="tg-sort" onClick={()=>onSort(key)}>{column.label}<span aria-hidden="true">{sortKey===key?(sortDir==='asc'?'↑':'↓'):'↕'}</span></button>:<span className="tg-header-label">{column.label}</span>}</div>
        <span role="separator" tabIndex={0} aria-label={'Resize '+column.label+' column'} aria-orientation="vertical" aria-valuemin={column.min} aria-valuemax={800} aria-valuenow={layout.widths[key]} className="tg-resize" onPointerDown={event=>startResize(event,key)} onPointerMove={previewResize} onPointerUp={()=>endResize(false)} onPointerCancel={()=>endResize(true)} onLostPointerCapture={()=>{if(resize.current)endResize(true)}} onDoubleClick={()=>changeWidth(key,column.width)} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const width=event.key==='Home'?column.width:event.key==='End'?800:layout.widths[key]+(event.key==='ArrowLeft'?-1:1)*(event.shiftKey?40:16);changeWidth(key,width)}}/>
      </th>})}</tr></thead>
      <tbody>{items.map(transaction=>{const status=effectiveStatus(transaction,today),feeKind=presentationFeeKind(transaction);return <tr key={transaction.id} data-fee-kind={feeKind||undefined} className={[transaction.amount<0||status==='paid'?'tg-paid':'',feeKind?'tg-fee':'',selected.has(transaction.id)?'tg-selected':''].join(' ')}><td className="tg-check"><input type="checkbox" checked={selected.has(transaction.id)} disabled={!!transaction.feeAssessmentId} onChange={()=>onToggleOne(transaction.id)} aria-label={'Select '+transaction.description+' transaction'}/></td>{layout.order.map(key=><td key={key} data-column={key} className={'tg-cell tg-cell-'+key}>{renderCell(key,transaction)}</td>)}</tr>})}</tbody>
      <tfoot><tr><td colSpan={layout.order.length+1}><div className="tg-total"><span>Filtered total ({count} records)</span><strong>{formatPeso(total)}</strong></div></td></tr></tfoot>
    </table></div>}
  </section>
}
