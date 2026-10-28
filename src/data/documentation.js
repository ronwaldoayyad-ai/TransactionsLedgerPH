import scope from '../../docs/project/PRD.md?raw'
import flow from '../../docs/project/user-flow.md?raw'
import technical from '../../docs/project/Architecture.md?raw'
import srs from '../../docs/project/SRS.md?raw'
import brd from '../../docs/project/BRD.md?raw'
import design from '../../docs/project/SDD.md?raw'
import testing from '../../docs/project/TDD.md?raw'
import guidelines from '../../docs/project/Guidelines.md?raw'
import theme from '../../docs/project/Design-System.md?raw'
import ia from '../../docs/project/UIRD.md?raw'
import assets from '../../docs/project/Document-Management.md?raw'
import schema from '../../docs/project/Database-Storage.md?raw'
import legal from '../../public/legal-content.json'
import {legalMarkdown} from '../lib/documentation'

const definitions=[
 ['scope','Project Requirements and Scope Documentation','Purpose, users, current features and release boundaries.','PRD.md',scope],
 ['user-flow','User Flow','Sign-in, payment review, requests and account recovery.','user-flow.md',flow],
 ['technical','Technical Diagram and Documentation','System boundaries, services, realtime and integrations.','Architecture.md',technical],
 ['srs','Software Requirements Specification','Functional, interface, data and quality requirements.','SRS.md',srs],
 ['brd','Business Requirements Document','Stakeholders, business outcomes and financial boundaries.','BRD.md',brd],
 ['design','Design Document','Component responsibilities, state and interaction patterns.','SDD.md',design],
 ['testing','Testing and Debugging Procedures','Verification, hosted acceptance, incidents and recovery.','TDD.md',testing],
 ['guidelines','User and Developer Guidelines','Borrower, lender, contributor and operator guidance.','Guidelines.md',guidelines],
 ['theme','Theme and Color Palettes Documentation','Typography, semantic colours, motion and live source tokens.','Design-System.md',theme],
 ['ia','Information Architecture & UX Artifacts','Navigation, journeys, wireframes and UX acceptance.','UIRD.md',ia],
 ['assets','Document Management Assets','Canonical ownership, templates, exports and change records.','Document-Management.md',assets],
 ['schema','Database & Storage Schema Documentation','Read-only catalog of tables, relationships, policies and buckets.','Database-Storage.md',schema],
 ['privacy','Privacy Policy','Current privacy notice, including the Cookie Policy.','public/legal-content.json',legalMarkdown('Privacy Policy',legal.privacy,legal.updated)],
 ['terms','Terms & Conditions','Current terms, disclaimer, copyright notice and acceptable use.','public/legal-content.json',legalMarkdown('Terms & Conditions',legal.terms,legal.updated)],
]
export const documentationSections=definitions.map(([id,title,summary,file,markdown],i)=>({id,title,summary,source:file.startsWith('public/')?file:'docs/project/'+file,number:i+1,markdown}))
export const documentationPolicyDate=legal.updated

const n=(id,x,y,label,detail)=>({id,x,y,label:label.split('|'),detail})
export const documentationDiagrams={
 architecture:{title:'Application architecture',width:940,height:370,nodes:[n('admin',10,35,'Admin workspace','Review and operations'),n('borrower',10,210,'Borrower workspace','New frame / Classic'),n('host',260,120,'React host','Session · routes · providers'),n('api',510,35,'Vercel services','Validation and integrations'),n('db',745,35,'Supabase database','RLS · guarded RPCs'),n('identity',745,210,'Auth / Storage','Identity and file access'),n('external',510,210,'External providers','Telegram · AI · Brandfetch')],edges:[['admin','host'],['borrower','host'],['host','api'],['host','db'],['api','db'],['api','identity'],['api','external']]},
 access:{title:'Access and interface flow',width:940,height:240,nodes:[n('signin',10,80,'Shared sign-in','Password / Login Code'),n('checks',255,80,'Access checks','Profile · session · lock'),n('admin',505,10,'Admin workspace','New / Classic controls'),n('borrower',505,140,'Borrower assignment','New / Classic selection'),n('support',745,80,'Blocked / recovery','Support and lender review')],edges:[['signin','checks'],['checks','admin'],['checks','borrower'],['checks','support']]},
 payment:{title:'Proof submission to reviewed posting',width:940,height:260,nodes:[n('select',10,80,'Select positive dues','Verify proof and details'),n('pending',255,80,'Save pending proof','Submission confirmation'),n('review',505,80,'Lender review','Allocation and credit'),n('posted',745,10,'Approved posting','Balances and documents'),n('correct',745,150,'Rejected / correction','Review updated evidence')],edges:[['select','pending'],['pending','review'],['review','posted'],['review','correct']]},
 realtime:{title:'Live record updates',width:940,height:180,nodes:[n('change',10,50,'Confirmed change','Record or message'),n('signal',255,50,'Database signal','Owner-scoped invalidation'),n('refresh',505,50,'Provider refresh','Authorized read model'),n('screen',745,50,'Current screen','No manual page reload')],edges:[['change','signal'],['signal','refresh'],['refresh','screen']]},
 borrower:{title:'Borrower navigation map',width:940,height:330,nodes:[n('home',10,120,'Borrower workspace','Mobile / desktop'),n('dashboard',255,10,'Dashboard','Balances · activity'),n('transactions',255,120,'Transactions','Cards · lists · schedules'),n('payment',255,230,'Payments / History','Proof and reviewed activity'),n('more',600,65,'More destinations','Profile · support · docs'),n('communications',600,205,'Communication','Lender · notices · help')],edges:[['home','dashboard'],['home','transactions'],['home','payment'],['home','more'],['home','communications']]},
 database:{title:'Core data relationships (simplified)',width:940,height:390,nodes:[n('profiles',10,140,'profiles','Borrower / admin identity'),n('loans',255,15,'loans','Terms and category'),n('transactions',505,15,'transactions','Standalone / linked dues'),n('payments',255,255,'payments','Proof and review evidence'),n('postings',505,255,'payment_postings','Reviewed application'),n('allocations',745,135,'payment_allocations','Applied amounts per due'),n('brands',745,15,'retail_brand_assignments','Loan or transaction logo')],edges:[['profiles','loans'],['profiles','payments'],['loans','transactions'],['payments','postings'],['postings','allocations'],['transactions','allocations'],['transactions','brands'],['loans','brands']]},
}
