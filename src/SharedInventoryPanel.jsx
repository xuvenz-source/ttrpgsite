import React from 'react';
import InventoryPanel from './InventoryPanel.jsx';
import useCampaignSheetInventory from './useCampaignSheetInventory.js';

/** Durable per-item editing for every Inventory field in character/NPC sheets. */
export default function SharedInventoryPanel({db,campaignId,userId,isDM=false,
 sourceType,sourceId,field,template,sheetValues}){
 const live=useCampaignSheetInventory({
  db,campaignId,userId,isDM,sourceType,sourceId,fieldId:field.id
 });
 if(live.error&&!live.ready)return <p className="error small" role="alert">
  Inventory unavailable: {live.error}</p>;
 return <div className="live-sheet-inventory">
  {!live.ready?<p className="muted tiny" role="status">
    Opening collaborative inventory…</p>:<>
   <InventoryPanel field={field} value={live.rows} template={template}
    sheetValues={{...sheetValues,[field.id]:live.rows}}
    onChange={live.changeItems} collaboration={live}/>
   <p className="muted tiny" role="status">
    Changes save automatically · Items grey out while someone else edits
   </p>
   {live.error&&<p className="error tiny" role="alert">{live.error}</p>}
  </>}
 </div>;
}
