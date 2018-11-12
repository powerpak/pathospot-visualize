<!DOCTYPE html>
<html>
<?php
if (file_exists(dirname(__FILE__).'/php/include.php')) { require(dirname(__FILE__).'/php/include.php'); }
else { require(dirname(__FILE__).'/php/example.include.php'); }

require(dirname(__FILE__).'/php/lib.dendro-timeline.php');

$error = NULL;
$matching_tree = NULL;

if (isset($_GET['db'])) {
  $db = preg_replace('/[^\w.-]/i', '', $_GET['db']);
  $json = json_decode(@file_get_contents(dirname(__FILE__). "/data/$db.heatmap.json"), TRUE);
}
if (isset($json) && $json && is_array($json["trees"])) {
  $isolates = isset($_GET['isolates']) ? array_filter(explode(' ', $_GET['isolates']), 'valid_isolate_id') : false;
  if (!$isolates || !count($isolates)) { $error = "No valid isolate_ID's were given in the `isolates` parameter"; }
  else {
    foreach ($json["trees"] as $tree) {
      $num_matches = 0;
      foreach ($isolates as $isolate_id) {
        $num_matches += preg_match('/[(,]' . preg_quote($isolate_id, '/') . '[:,]/', $tree);
      }
      if ($num_matches == count($isolates)) {
        $matching_tree = $tree;
        break;
      }
    }
  }
} else { $error = "Could not load valid JSON from `db`. Is there a matching `.heatmap.json` file in `data/`?"; }

if (!$matching_tree) { $error = "Could not find a fully-linked tree that connects all the specified isolates."; }
else { $pruned_tree = prune_tree($matching_tree, $isolates); }

?>
<head>
  
<meta charset="utf-8" />
<title>Surveillance Isolates - Dendrogram with Timeline</title>

<script src="js/underscore-min.js"></script>
<script src="js/jquery.min.js"></script>
<script src="js/d3.v4.min.js" charset="utf-8"></script>

<?php
if (file_exists(dirname(__FILE__).'/js/config.js')) { ?><script src="js/config.js" charset="utf-8"></script><?php }
else { ?><script src="js/example.config.js" charset="utf-8"></script><?php }
?>

<?php includeAfterHead(); ?>

</head>

<body>
  
<?php includeBeforeBody(); ?>

<?php if ($error): ?>
<div class="error"><?= htmlspecialchars($error) ?></div>
<?php else: ?>

<div id="dendro-timeline"></div>

<script src="js/pathogendb.dendro-timeline.js"></script>

<?php endif; ?>

<?php includeAfterBody(); ?>

</body>
</html>