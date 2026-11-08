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
  'src/QueuedWrites.js',
  'src/TabletopApp.jsx',
  'src/BattlemapBoard.jsx',
  'src/SheetTemplateDesigner.jsx',
  'src/AppBoundaries.jsx',
  'src/TabletopSheetDefaults.js',
  'src/useCampaignPresence.js',
  'src/main.jsx',
  'src/LiveMovementPreview.js',
  'src/LiveTokenMovement.js',
  'src/LiveToolMovement.js',
  // Consolidated movement/fog redesign: validate every new security-critical
  // module for undeclared runtime identifiers, not only JSX entrypoints.
  'src/AuthorizedNavigation.js',
  'src/AuthorizedMovementPlanner.js',
  'src/AuthorizedViewerTick.js',
  'src/AuthorizedFogDelta.js',
  'src/FogVisibilityContinuity.js',
  'src/MapFogModel.js',
  'src/DragCollisionGuard.js',
  'src/MovementDiagnostics.js',
  'src/MapMovementPath.js',
  'src/MapCollision.js',
  'src/MapSelection.js',
  'src/MapEnvironment.js'
 ],
 languageOptions:{
  ecmaVersion:2022,sourceType:'module',
  parserOptions:{ecmaFeatures:{jsx:true}},
  globals:{...globals.browser,...globals.node}
 },
 rules:{'no-undef':'error'}
}];
