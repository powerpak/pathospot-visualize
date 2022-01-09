<?php

// COPY TO include.php AND CUSTOMIZE AS DESIRED.

include('lib.global.php');
date_default_timezone_set('America/New_York');
$PYTHON = '/usr/bin/env python';

function includeAfterHead() {
?>
  <link href="fonts/Jost.css" rel="stylesheet" type="text/css" charset="utf-8" />
  <link href="css/splash.css" rel="stylesheet" type="text/css" />
  <!-- Uncomment the following stylesheet to show the product splash page, as on the pathospot.org homepage -->
  <!-- <link href="css/splash.show-all.css" rel="stylesheet" type="text/css" /> -->
<?php
}
  
function includeBeforeBody() {
?>
  <div class="fixed-header">
    <div class="header-links">
      <a href="index.php" class="logo"></a>
      <a class="tutorial-btn"><span class="extra">Play </span><svg width=0 height=0></svg>Tutorial</a>
      <a href="index.php#get-started">Install</a>
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