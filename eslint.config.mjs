import globals from 'globals';

/**
 * Initial focused guard against runtime errors that JSX bundling does not catch.
 * Expand coverage when existing legacy components have been cleaned.
 */
export default [{
 files:[
  'src/CharacterEditor.jsx',
  'src/InventoryItemEditor.jsx',
  'src/InventoryPanel.jsx',
  'src/CampaignToolSheet.jsx',
  'src/InventoryCollaborationCore.js',
  'src/useCampaignSheetInventory.js',
  'src/useCampaignToolCollaboration.js',
  'src/useCampaignTools.js',
  'src/useCampaignHandouts.js',
  'src/useMapCombat.js',
  'src/useAuthorizedMapFog.js',
  'src/QueuedWrites.js'
 ],
 languageOptions:{
  ecmaVersion:2022,sourceType:'module',
  parserOptions:{ecmaFeatures:{jsx:true}},
  globals:{...globals.browser,...globals.node}
 },
 rules:{'no-undef':'error'}
}];
