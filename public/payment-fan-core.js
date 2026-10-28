// Geometry and motion are shared by the presentation and regression checks.
const PaymentFanCore=(()=>{
 const motion=Object.freeze({enter:360,exit:200,stagger:30,easing:'cubic-bezier(0.34, 1.56, 0.64, 1)',exitEasing:'ease-in',reduced:120});
 const actions=Object.freeze([{page:'installment',label:'Installment Transactions',icon:'calendar'},{page:'straight',label:'Straight Transactions',icon:'arrows'},{page:'payment',label:'Submit Payment',icon:'qr'},{page:'invoices',label:'My Invoices',icon:'document'},{page:'loanProfile',label:'Loan Profile',icon:'card'}]);
 function layout({width,height,anchorX,anchorY}){
  const compact=height<360,tiny=height<300,fanWidth=Math.min(460,width),icon=tiny?44:compact||width<320?48:54,labelHeight=tiny?22:compact?24:28,labelGap=compact?6:8;
  const x=Math.max(fanWidth/2,Math.min(width-fanWidth/2,anchorX)),y=height<320?height-42:Math.min(height-34,anchorY),radius=(fanWidth-92)/2,base=compact?80:108,rise=Math.max(40,Math.min(152,y-base-icon/2-12));
  const logoWidth=Math.min(width<340?132:166,fanWidth-172),logoHeight=tiny?38:compact?44:56,diagonalLabelBottom=-base-rise*Math.SQRT1_2+icon/2+labelGap+labelHeight,logoY=Math.max(compact?-78:-84,diagonalLabelBottom+8+logoHeight/2);
  const items=actions.map((action,i)=>{const angle=Math.PI-i*Math.PI/4;return {...action,x:Math.cos(angle)*radius,y:-base-Math.sin(angle)*rise,labelWidth:i===2&&width<300?68:i===0||i===4?72:88,delay:i*motion.stagger}});
  return {anchorX:x,anchorY:y,icon,labelHeight,labelGap,compact,tiny,logoWidth,logoHeight,logoY,items};
 }
 return Object.freeze({actions,motion,layout});
})();
if(typeof window!=='undefined')window.PaymentFanCore=PaymentFanCore;
