import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react'
import {useApp} from './AppContext'
import {supabase} from '../supabaseClient'
import {subscribeToInvalidations} from '../lib/realtimeInvalidation'
import {createRetailBrandResolver,retailTarget} from '../lib/retailBrands'

const Context=createContext(null)
// eslint-disable-next-line react-refresh/only-export-components -- shared context hook follows existing providers
export const useRetailBrands=()=>useContext(Context)
export function RetailBrandsProvider({children}){
 const {realSession,session,transactions}=useApp(),owner=realSession||session,id=owner?.user.id,admin=owner?.user.role==='admin',live=owner?.source==='supabase'
 const [assignments,setAssignments]=useState([]),[rules,setRules]=useState([]),[error,setError]=useState(''),[ready,setReady]=useState(false),generation=useRef(0)
 const clientId=import.meta.env.VITE_BRANDFETCH_CLIENT_ID||''
 const refresh=useCallback(async()=>{
  const current=++generation.current;if(!id)return
  try{const read=async table=>{const rows=[];for(let from=0;;from+=1000){const r=await supabase.from(table).select('*').order(table==='retail_brand_assignments'?'target_key':'id').range(from,from+999);if(r.error)throw Error('Brand logo settings could not be loaded. Please retry.');rows.push(...r.data);if(r.data.length<1000)return rows}}
   const [nextAssignments,nextRules]=await Promise.all([read('retail_brand_assignments'),read('retail_brand_rules')]);if(current!==generation.current)return;setAssignments(nextAssignments);setRules(nextRules);setReady(true);setError('')
  }catch(e){if(current===generation.current){setError(e.message);setReady(false)}}
 },[id])
 // Owner changes clear old metadata before a different session can use it.
 useEffect(()=>{let active=true;const guard=generation;queueMicrotask(()=>{if(!active)return;setAssignments([]);setRules([]);setError('');setReady(!live);if(live)refresh()});return()=>{active=false;++guard.current}},[id,live,refresh])
 const scope=useMemo(()=>transactions.map(t=>t.id+':'+t.userId).sort().join('|'),[transactions])
 useEffect(()=>{if(!id||!live)return;const stops=[subscribeToInvalidations({client:supabase,name:'retail-brands-'+id,table:'retail_brand_assignments',ownerId:id,ownerColumn:'user_id',isAdmin:admin,onChange:refresh,onError:()=>{}}),subscribeToInvalidations({client:supabase,name:'retail-brand-rules-'+id,table:'retail_brand_rules',isAdmin:true,onChange:refresh,onError:()=>{}})];return()=>stops.forEach(stop=>stop())},[id,live,admin,refresh,scope])
 const assign=useCallback(async payload=>{
  if(!admin)return {error:'Only the lender can assign brand logos.'}
  if(!live)return {error:'Sign in to a connected account to save brand logos.'}
  const {data,error:failure}=await supabase.rpc('admin_assign_retail_brand',{p_payload:payload});if(failure)return {error:failure.message};await refresh();return {data,error:null}
 },[admin,live,refresh])
 const saveRule=useCallback(async payload=>{
  if(!admin||!live)return {error:'Sign in as the lender to manage matching rules.'}
  const {data,error:failure}=await supabase.rpc('admin_save_retail_brand_rule',{p_payload:payload});if(failure)return {error:failure.message};await refresh();return {data,error:null}
 },[admin,live,refresh])
 const resolve=useMemo(()=>{const cached=createRetailBrandResolver(assignments,rules);return(t,l)=>ready?cached(t,l):{status:'loading',domain:null,target:retailTarget(t,l)}},[assignments,rules,ready])
 const value=useMemo(()=>({assignments,rules,clientId,ready,error,refresh,assign,saveRule,resolve}),[assignments,rules,clientId,ready,error,refresh,assign,saveRule,resolve])
 return <Context.Provider value={value}>{children}</Context.Provider>
}
