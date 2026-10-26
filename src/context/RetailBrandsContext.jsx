import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react'
import {useApp} from './AppContext'
import {supabase} from '../supabaseClient'
import {subscribeToInvalidations} from '../lib/realtimeInvalidation'
import {createRetailBrandResolver,retailTarget} from '../lib/retailBrands'
import {createGroupLogoResolver} from '../lib/groupLogos'

const Context=createContext(null)
// eslint-disable-next-line react-refresh/only-export-components -- shared context hook follows existing providers
export const useRetailBrands=()=>useContext(Context)
export function RetailBrandsProvider({children}){
 const {realSession,session,transactions}=useApp(),owner=realSession||session,id=owner?.user.id,admin=owner?.user.role==='admin',live=owner?.source==='supabase'
 const [assignments,setAssignments]=useState([]),[rules,setRules]=useState([]),[error,setError]=useState(''),[ready,setReady]=useState(false),generation=useRef(0)
 const [groupLogos,setGroupLogos]=useState([]),[groupError,setGroupError]=useState(''),[groupsReady,setGroupsReady]=useState(false),groupGeneration=useRef(0)
 const clientId=import.meta.env.VITE_BRANDFETCH_CLIENT_ID||''
 const refresh=useCallback(async()=>{
  const current=++generation.current;if(!id)return
  try{const read=async table=>{const rows=[];for(let from=0;;from+=1000){const r=await supabase.from(table).select('*').order(table==='retail_brand_assignments'?'target_key':'id').range(from,from+999);if(r.error)throw Error('Brand logo settings could not be loaded. Please retry.');rows.push(...r.data);if(r.data.length<1000)return rows}}
   const [nextAssignments,nextRules]=await Promise.all([read('retail_brand_assignments'),read('retail_brand_rules')]);if(current!==generation.current)return;setAssignments(nextAssignments);setRules(nextRules);setReady(true);setError('')
  }catch(e){if(current===generation.current){setError(e.message);setReady(false)}}
 },[id])
 const refreshGroups=useCallback(async()=>{const current=++groupGeneration.current;if(!id)return;try{const {data,error:failure}=await supabase.from('transaction_group_logos').select('group_key,svg,filename,version,updated_at').order('group_key');if(failure)throw Error('Group logos could not be loaded. Please retry.');if(current===groupGeneration.current){setGroupLogos(data);setGroupsReady(true);setGroupError('')}}catch(e){if(current===groupGeneration.current){setGroupError(e.message);setGroupsReady(false)}}},[id])
 // Owner changes clear old metadata before a different session can use it.
 useEffect(()=>{let active=true;const guard=generation;queueMicrotask(()=>{if(!active)return;setAssignments([]);setRules([]);setError('');setReady(!live);if(live)refresh()});return()=>{active=false;++guard.current}},[id,live,refresh])
 useEffect(()=>{let active=true;const guard=groupGeneration;queueMicrotask(()=>{if(!active)return;setGroupLogos([]);setGroupError('');setGroupsReady(!live);if(live)refreshGroups()});return()=>{active=false;++guard.current}},[id,live,refreshGroups])
 useEffect(()=>{if(!id||!live)return;return subscribeToInvalidations({client:supabase,name:'transaction-group-logos-'+id,table:'transaction_group_logos',isAdmin:true,onChange:refreshGroups,onError:()=>{}})},[id,live,refreshGroups])
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
 const resolve=useMemo(()=>{const retail=createRetailBrandResolver(assignments,rules),groups=createGroupLogoResolver(groupLogos);return(t,l)=>groups(t,l)||(ready?retail(t,l):{status:'loading',domain:null,target:retailTarget(t,l)})},[assignments,rules,ready,groupLogos])
 const value=useMemo(()=>({assignments,rules,clientId,ready,error,refresh,assign,saveRule,resolve,groupLogos,groupError,groupsReady,refreshGroups}),[assignments,rules,clientId,ready,error,refresh,assign,saveRule,resolve,groupLogos,groupError,groupsReady,refreshGroups])
 return <Context.Provider value={value}>{children}</Context.Provider>
}
