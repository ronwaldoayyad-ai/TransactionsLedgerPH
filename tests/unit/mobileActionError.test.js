import test from 'node:test'
import assert from 'node:assert/strict'
import {mobileActionError} from '../../src/lib/mobileActionError.js'
test('payment access errors explain reauthentication and retained drafts without showing SQL policy details',()=>{
 for(const message of ['new row violates row-level security policy','JWT expired','An active sign-in is required.']){
  const text=mobileActionError('payment-submit',{message});assert.match(text,/sign in again/i);assert.match(text,/draft.*kept/i);assert.doesNotMatch(text,/row-level|SQL|JWT/i)
 }
})
test('uncertain network results retain the draft and tell users to check recent payments before retrying',()=>{
 const text=mobileActionError('payment-submit',{message:'Failed to fetch'});assert.match(text,/could not be confirmed/i);assert.match(text,/Recent Payments/);assert.match(text,/draft.*kept/i)
})
test('actionable validation and other action errors keep their specific message',()=>{
 assert.equal(mobileActionError('payment-submit',{message:'Choose a payment date that is not in the future.'}),'Choose a payment date that is not in the future.')
 assert.equal(mobileActionError('support-submit',{message:'Describe the issue in 10 to 2000 characters.'}),'Describe the issue in 10 to 2000 characters.')
 assert.equal(mobileActionError('payment-submit',null),'Unable to save. Please retry.')
})
