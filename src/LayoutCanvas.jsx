import { useMemo } from 'react';

function bounds(polygon){
 const xs=polygon.filter((_,index)=>index%2===0),ys=polygon.filter((_,index)=>index%2===1);
 return {left:Math.min(...xs),top:Math.min(...ys),right:Math.max(...xs),bottom:Math.max(...ys)};
}
function styleFor(region,page){
 const box=bounds(region.polygon);
 return {left:`${box.left/page.width*100}%`,top:`${box.top/page.height*100}%`,width:`${(box.right-box.left)/page.width*100}%`,height:`${(box.bottom-box.top)/page.height*100}%`};
}
export default function LayoutCanvas({data,figureUrls=[],showBoxes}){
 const result=data?.analyzeResult,page=result?.pages?.[0],figures=result?.figures||[];
 const figureRegions=useMemo(()=>figures.map(item=>item.boundingRegions?.find(region=>region.pageNumber===page?.pageNumber)).filter(Boolean),[figures,page]);
 if(!page)return <div className="empty">No Azure Document Intelligence layout.json was found for this source page.</div>;
 const insideFigure=region=>{const box=bounds(region.polygon),x=(box.left+box.right)/2,y=(box.top+box.bottom)/2;return figureRegions.some(candidate=>{const f=bounds(candidate.polygon);return x>=f.left&&x<=f.right&&y>=f.top&&y<=f.bottom;});};
 return <div className="layout-canvas" style={{aspectRatio:`${page.width}/${page.height}`}}>
  {(result.paragraphs||[]).map((paragraph,index)=>{const region=paragraph.boundingRegions?.find(item=>item.pageNumber===page.pageNumber);if(!region||insideFigure(region))return null;return <div key={`p-${index}`} className={`layout-text role-${paragraph.role||'body'}`} style={styleFor(region,page)}>{paragraph.content}</div>;})}
  {figureRegions.map((region,index)=><img key={`f-${index}`} className="layout-figure" style={styleFor(region,page)} src={figureUrls[index]||''} alt={`Extracted figure ${index+1}`}/>)}
  {showBoxes&&(result.paragraphs||[]).map((paragraph,index)=>{const region=paragraph.boundingRegions?.find(item=>item.pageNumber===page.pageNumber);return region?<div key={`b-${index}`} className="layout-box" style={styleFor(region,page)} title={paragraph.content}/>:null;})}
 </div>;
}
