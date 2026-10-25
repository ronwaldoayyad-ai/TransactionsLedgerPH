import {useState} from 'react'
import {brandLogoUrl} from '../lib/retailBrands'
import {useRetailBrands} from '../context/RetailBrandsContext'
import './RetailBrandLogo.css'
export default function RetailBrandLogo({transaction,loan,onClick,compact=false}){
 const brands=useRetailBrands(),resolved=brands.resolve(transaction,loan),url=brandLogoUrl(resolved.domain,brands.clientId),[failed,setFailed]=useState(null)
 if(!resolved.target)return compact?null:<span className="text-slate-400">—</span>
 const content=<><span className="retail-brand-image">{url&&failed!==url?<img src={url} alt={resolved.name+' logo'} loading="lazy" decoding="async" referrerPolicy="strict-origin-when-cross-origin" onError={()=>setFailed(url)}/>:<span aria-hidden="true">▣</span>}</span>{!compact&&<span className="min-w-0 truncate">{resolved.name||(resolved.status==='review'?'Choose brand':resolved.status==='hidden'?'No logo':'Assign brand')}<small className="block text-[10px] text-slate-500">{resolved.status==='automatic'?'Automatic':resolved.status==='manual'?'Assigned':resolved.status==='review'?'Needs review':''}</small></span>}</>
 return onClick?<button type="button" className="retail-brand-cell" onClick={onClick} title="Search, replace or remove brand logo">{content}</button>:<span className="retail-brand-cell">{content}</span>
}
