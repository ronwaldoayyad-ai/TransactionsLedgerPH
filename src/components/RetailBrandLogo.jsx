import {useState} from 'react'
import {brandLogoUrl} from '../lib/retailBrands'
import {useRetailBrands} from '../context/RetailBrandsContext'
import './RetailBrandLogo.css'
export default function RetailBrandLogo({transaction,loan,onClick,compact=false}){
 const brands=useRetailBrands(),resolved=brands.resolve(transaction,loan),group=resolved.status==='group',uploaded=resolved.status==='uploaded',local=group||uploaded,url=local?resolved.url:brandLogoUrl(resolved.domain,brands.clientId),[failed,setFailed]=useState(null)
 if(compact&&group&&!url)return null
 if(!resolved.target)return compact?null:<span className="text-slate-400">—</span>
 const fallback=local?null:url?.replace('/type/logo','/icon.webp')
 const content=<><span className="retail-brand-image">{url&&(local?failed!==url:failed!==fallback)?<img src={!local&&failed===url?fallback:url} alt={resolved.name+' logo'} loading="lazy" decoding="async" referrerPolicy="strict-origin-when-cross-origin" onError={()=>setFailed(!local&&failed===url?fallback:url)}/>:<span aria-hidden="true">▣</span>}</span>{!compact&&<span className="min-w-0 truncate">{resolved.name||(resolved.status==='review'?'Choose brand':resolved.status==='hidden'?'No logo':'Assign brand')}<small className="block text-[10px] text-slate-500">{group?(url?'Shared group logo':'Upload group logo'):uploaded?'Uploaded':resolved.status==='automatic'?'Automatic':resolved.status==='manual'?'Assigned':resolved.status==='review'?'Needs review':''}</small></span>}</>
 return onClick?<button type="button" className="retail-brand-cell" onClick={onClick} title={group?'Upload, replace or remove shared group logo':'Search, replace or remove brand logo'}>{content}</button>:<span className="retail-brand-cell">{content}</span>
}
