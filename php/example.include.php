<?php

// COPY TO include.php AND CUSTOMIZE AS DESIRED.

date_default_timezone_set('America/New_York');
$PYTHON = '/usr/bin/env python';
  
function includeAfterHead() {
?>
  <link href="css/splash.css" rel="stylesheet" type="text/css" />
<?php
}
  
function includeBeforeBody() {
?>
  <div class="fixed-header">
    <div class="header-links">
      <a href="index.php" class="logo"></a>
      <a href="heatmap.php"><span class="extra">Live </span>Demo</a>
      <a href="index.php#get-started">Get Started</a>
      <a href="index.php#how-it-works">How It Works</a>
      <a href="index.php#team">Team</a>
      <span class="extra"><a href="https://github.com/powerpak/pathospot-compare" target="_blank">GitHub</a></span>
    </div>
  </div>
<?php
}

function includeAfterBody() {
  return;
}