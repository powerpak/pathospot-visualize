<?php
  $data_dir = dirname(__FILE__).'/data/';
  $mrsa_db = "out." . date("Y-m-d") . " .parsnp";
  $data_files = array_map('basename', array_reverse(glob($data_dir.'*.{snv,parsnp}.heatmap.json', GLOB_BRACE)));
  foreach ($data_files as $data_file) {
    if (strpos($data_file, 'outbreak_MRSA-orange_deID.') === 0) {
      $mrsa_db = preg_replace('/\\.heatmap\\.json$/', '', $data_file); break;
    } else if (strpos($data_file, 'out.') === 0) {
      $mrsa_db = preg_replace('/\\.heatmap\\.json$/', '', $data_file); break;
    }
  }
?><!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>pathoSPOT – Pathogen Sequencing Phylogenomic Outbreak Toolkit</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  
  <script src="https://ajax.googleapis.com/ajax/libs/jquery/2.1.3/jquery.min.js"></script>
  <script src="js/underscore-min.js"></script>
  
  <link rel="stylesheet" href="https://indestructibletype.com/fonts/Jost.css" type="text/css" charset="utf-8" />
  <link href="https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;700&display=swap" rel="stylesheet" />
  <link href="css/splash.css" rel="stylesheet" type="text/css" />
</head>
<body class="pathospot-splash">
  <div class="header-links">
    <div class="logo">
      
    </div>
    <a href="#live-demo"><span class="extra">Live </span>Demo</a>
    <a href="#get-started">Get Started</a>
    <a href="#how-it-works">How It Works</a>
    <a href="#team">Team</a>
    <span class="extra"><a href="https://github.com/powerpak/pathospot-compare">GitHub</a></span>
  </div>
  
  <div class="main">
    <div class="logo">
      <h1>pathoSPOT</h1>
    </div>
  
    <h2 class="center mid-width new-section">
      <a id="about">Pathogen Sequencing<br/>Phylogenomic Outbreak Toolkit</a>
    </h2>
    <p class="center mid-width">
      <span class="regular">pathoSPOT</span> is an open-source bioinformatics pipeline that turns pathogen genome sequences sampled from patients into interactive visualizations of probable transmission scenarios.
    </p>
  
    <h2 class="center mid-width new-section">
      <a id="live-demo">Try it now</a>
    </h2>
    <p class="center mid-width">
      Click to explore these visualizations of methicillin-resistant <em>Staphylococcus aureus</em> collected over a 24 month period throughout the Mount Sinai Health System.
    </p>
    <div class="container cols-2">
      <div class="col">
        <div class="col-content center">
          <p>
            <a target="_blank" href="heatmap.php?db=<?= htmlentities($mrsa_db) ?>">
              <img src="images/heatmap.png" class="figure shadow"/>
            </a>
          </p>
          <p>Clustered heatmap of related genomes reveals outbreaks over multiple wards.</p>
          <p class="secondary"><strong>Figure 2</strong> in Berbel Caban &amp; Pak, et al.</p>
        </div>
      </div>
      <div class="col">
        <div class="col-content center">
          <p>
            <a target="_blank" href="dendro-timeline.php?db=<?= htmlentities($mrsa_db) ?>&amp;assemblies=S_aureus_ER11501_3A_026953+S_aureus_ER11761_3A_027108+S_aureus_ER07227_3A_025296+S_aureus_ER05786_3A_024918+S_aureus_ER05686_3A_023855+S_aureus_ER05682_3A_023854+S_aureus_PS00099_3A_024679+S_aureus_ER07103_3A_025066+S_aureus_ER07191_3A_025295+S_aureus_ER07131_3A_025294+S_aureus_ER05686_5A_025756+S_aureus_ER05353_3A_023850+S_aureus_ER05508_3A_024907+S_aureus_ER05526_3A_024910+S_aureus_ER05891_3A_025759+S_aureus_ER06446_3A_024926+S_aureus_ER06037_3A_025806+S_aureus_ER05368_3A_023852+S_aureus_ER05866_3A_025757+S_aureus_ER05682_5A_025755+S_aureus_ER09911_3A_026327+S_aureus_ER07970_3C_026528">
              <img src="images/timeline.png" class="figure shadow"/>
            </a>
          </p>
          <p>A timeline of spatiotemporal movements and overlaps of patients in the largest cluster.</p>
          <p class="secondary"><strong>Figure 3</strong> in Berbel Caban &amp; Pak, et al.</p>
        </div>
      </div>
      <div class="clear"></div>
    </div>
    
    <h2 class="center mid-width new-section">
      <a id="get-started">Get Started</a>
    </h2>
    <div class="container cols-1">
      <p>
        You can use <span class="regular">pathoSPOT</span> to analyze your own pathogen genomes and create visualizations similar to the ones above. As a tutorial, we will reproduce the analysis in Berbal Caban &amp; Pak et al. starting from the <a href="https://pathospot.org/data/mrsa.tar.gz">raw data (tar.gz)</a>.
      </p>
      <p>
        This dataset contains FASTA sequences for 226 MRSA genomes, gene annotations in BED format, and a <a href="https://www.sqlite.org/index.html">SQLite</a> database with metadata for each genome (anonymized patient IDs, collection locations, healthcare encounters for each patient, and more).
      </p>
      <p>
        <span class="regular">pathoSPOT</span> is designed to run on Linux; however, we provide a Vagrant configuration so that anybody, including Mac and Windows users, can quickly create a virtual machine (VM) that runs the pipeline either on their personal computer or on the <a href="https://aws.amazon.com/ec2/">Amazon EC2 cloud</a>. We'll use VirtualBox to run the VM locally for this example; you'll need 5GB of disk space and 8GB of RAM.
      </p>
      <p>
        To get started, install <a href="https://www.vagrantup.com/downloads.html">Vagrant</a> and <a href="https://www.virtualbox.org/wiki/Downloads">VirtualBox</a>. Then open your terminal program and run the following commands:
      </p>
      <div class="code-block">
        <pre>$ git clone https://github.com/powerpak/pathospot-compare
<span class="output">Cloning into 'pathospot-compare'...
... More output ...</span>
$ cd pathospot-compare
$ vagrant up
<span class="output">... Much more output ... may want to get some </span><span class="emoji">&#x2615;</span>
$ vagrant ssh</pre>
      </div>
      <p>
        If everything worked, you should see <code>vagrant@stretch:/vagrant$</code> which is a shell running on your brand new Linux VM. To kick off the analysis, run:
      </p>
      <div class="code-block">
        <pre>$ rake all
<span class="output">... More output, takes 1/2 to 2 hours. The last line should be ...
WARN: re-invoking parsnp task since the mash clusters were rebuilt</span>
$</pre>
      </div>
      <p>
        When it's finished, open <a href="http://localhost:8888">http://localhost:8888</a> in your browser. (It will look exactly like this website, except the <a href="#live-demo">Try it Now</a> visualizations have now been built and are being served by your own VM.)
      </p>
    </div>
    
    <h2 class="center mid-width new-section">
      <a id="how-it-works">How it works</a>
    </h2>
    <p class="center mid-width">
      <span class="regular">pathoSPOT</span> is made of two components. One runs the comparative genomics analysis, and the other drives the visualization engine.
    </p>
    <div class="container cols-2">
      <div class="col">
        <div class="col-content center">
          <h3>pathospot-compare</h3>
          <p>
            <img src="images/pathospot-compare-diagram.svg" width="70%" style="margin-top: 12px"/>
          </p>
          <p>Prefilters FASTA sequences, clusters them by estimating nucleotide identity, and then creates multisequence alignments for each cluster of genomes to calculate SNP distances.</p>
          <p><a href="https://github.com/powerpak/pathospot-compare">
            View pathospot-compare on
            GitHub</a>.</p>
        </div>
      </div>
      <div class="col">
        <div class="col-content center">
          <h3>pathospot-visualize</h3>
          <p>
            <img src="images/pathospot-visualize-diagram.svg" width="60%"/>
          </p>
          <p>Converts calculated SNP distances and metadata on sample collection and patient movements to produce interactive heatmap and timeline visualizations viewable in a web browser.</p>
          <p><a href="https://github.com/powerpak/pathospot-visualize">
            View pathospot-visualize on
            GitHub</a>.</p>
        </div>
      </div>
      <div class="clear"></div>
    </div>
    
    <h2 class="center mid-width new-section">
      <a id="team">Team</a>
    </h2>
    <div class="container cols-1">
      <p><span class="regular">pathoSPOT</span> is developed, used, and maintained by the <a href="https://icahn.mssm.edu/research/genomics/research/pathogen-surveillance">Pathogen Surveillance Program</a> and the <a href="https://bakellab.mssm.edu/">Bakel Lab</a> at the <a href="https://icahn.mssm.edu/">Icahn School of Medicine at Mount Sinai</a>.
      </p>
      <p>It currently supports active surveillance of transmissible pathogens in facilities throughout the <a href="https://www.mountsinai.org/">Mount Sinai Health System.</a></p>
      <p>Contributing developers include: <a href="https://tedpak.com">Theodore Pak</a>, <a href="http://mjsull.github.io/">Mitchell Sullivan</a>, <a href="https://bakellab.mssm.edu/">Harm van Bakel</a>, and <a href="https://github.com/webste01">Elizabeth Webster</a>. On GitHub, you can also view the list of contributors for <a href="https://github.com/powerpak/pathospot-compare/graphs/contributors">each</a> <a href="https://github.com/powerpak/pathospot-visualize/graphs/contributors">project</a>.</p>
      <p><strong>Questions?</strong> Please contact <a href="mailto:theodore.r.pak@gmail.com">Theodore Pak</a> or <a href="mailto:harm.vanbakel@mssm.edu">Harm van Bakel</a>.</p>
      <p><strong>Bugs?</strong> Please file an issue on our GitHub projects:</p>
      <ul>
        <li><a href="https://github.com/powerpak/pathospot-compare/issues">pathospot-compare</a></li>
        <li><a href="https://github.com/powerpak/pathospot-visualize/issues">pathospot-visualize</a></li>
      </ul>
    </div>
    
  </div><!-- /div.main -->
  
  <div class="footer">
  </div>
  
  <script type="text/javascript">
    $(function() {
      // smooth scrolling to anchors
      $('a[href^="#"]').on('click',function (e) {
        e.preventDefault();
    
        var target = this.hash;
        var $target = $(target);
    
        $('html, body').stop().animate({
          'scrollTop': $target.offset().top - 60
        }, 500, 'swing', function () {
          if (window.history && window.history.replaceState) {
            history.replaceState(null, null, target);
          } else {
            window.location.hash = target;
          }
        });
      });
    
      // Open new tabs for non-local links
      $('a[href^="http://"], a[href^="https://"], a[href^="//"]').attr('target', '_blank');
      
      // Affix header links to top of viewport after scrolling past the header
      $(window).scroll(_.debounce(function(e) {
        var isFixed = $('body').hasClass('fixed-header');
        if ($(window).scrollTop() > 200 && !isFixed) { $('body').addClass('fixed-header'); }
        if ($(window).scrollTop() == 0 && isFixed) { $('body').removeClass('fixed-header'); }
      }, 300));
    });
  </script>
</body>
</html>

