<?php
  if (file_exists(dirname(__FILE__).'/php/include.php')) { require(dirname(__FILE__).'/php/include.php'); }
  else { require(dirname(__FILE__).'/php/example.include.php'); }

  $data_dir = get_data_dir();
  $mrsa_db = "out." . date("Y-m-d") . " .parsnp";
  $data_files = array_map('basename', array_reverse(glob($data_dir.'*.{snv,parsnp}.heatmap.json', GLOB_BRACE)));
  foreach ($data_files as $data_file) {
    if (strpos($data_file, 'outbreak_MRSA-orange_deID.') === 0) {
      $mrsa_db = preg_replace('/\\.heatmap\\.json$/', '', $data_file); break;
    } else if (strpos($data_file, 'out.') === 0) {
      $mrsa_db = preg_replace('/\\.heatmap\\.json$/', '', $data_file); break;
    }
  }
  redirect_short_urls($mrsa_db);
?><!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>pathoSPOT – Pathogen Sequencing Phylogenomic Outbreak Toolkit</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  
  <script src="https://ajax.googleapis.com/ajax/libs/jquery/2.1.3/jquery.min.js"></script>
  <script src="js/underscore-min.js"></script>
  
  <link href="https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;700&display=swap" rel="stylesheet" />
  
  <?php includeAfterHead(); ?>
</head>
<body class="pathospot-splash">
  <div class="header-links">
    <div class="logo">
      
    </div>
    <a href="#live-demo" class="product-splash product-splash-inline"><span class="extra">Live </span>Demo</a>
    <a href="#get-started">Install</a>
    <a href="#how-it-works">How It Works</a>
    <a href="#team">Team</a>
    <span class="extra"><a href="https://github.com/powerpak/pathospot-compare">GitHub</a></span>
  </div>
  
  <div class="main">
    <div class="logo">
      <h1>pathoSPOT</h1>
    </div>
  
    <div class="available-datasets">
      <h2 class="center mid-width new-section">
        <a id="available-datasets">Available Datasets</a>
      </h2>

<?php if (count($data_files) == 0): ?>
      <p class="center mid-width">
        There aren't any analyzed datasets in your
        <code><?= htmlspecialchars(get_data_dir(FALSE)) ?></code>
        directory.
      </p>
      <p class="center mid-width">
        See the instructions below on how to run the <span class="regular">pathoSPOT</span>
        pipeline on an example dataset to create your first visualization.
      </p>
<?php else: ?>  
      <p class="center mid-width">
        The following datasets were detected in your
        <code><?= htmlspecialchars(get_data_dir(FALSE)) ?></code>
        directory. Click the links below to open the heatmap for each dataset.
      </p>

      <ul class="center mid-width">
        <?php foreach ($data_files as $data_file):
          $db = preg_replace('/\\.heatmap\\.json$/', '', $data_file);
        ?>      
        <li><a href="heatmap.php?db=<?= htmlspecialchars($db) ?>"><?= htmlspecialchars($db) ?></a></li>
        <?php endforeach; ?>
      </ul>
      <p class="center mid-width">
        See the instructions below on how to run the <span class="regular">pathoSPOT</span>
        pipeline to produce a new analyzed dataset.
      </p>
<?php endif; ?>
    </div>
  
    <div class="product-splash">
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
        Click the images to explore visualizations of methicillin-resistant <em>Staphylococcus aureus</em> collected over 24 months within the Mount Sinai Health System (full article at <a target="_blank" href="https://genomemedicine.biomedcentral.com/articles/10.1186/s13073-020-00798-3"><em>Genome Medicine</em></a>).
      </p>
      <p class="center secondary">Dates have been shifted during data anonymization.</p>
      <div class="container cols-2">
        <div class="col">
          <div class="col-content center">
            <p>
              <a target="_blank" href="?fig=2">
                <img src="images/heatmap.png" class="figure shadow"/>
              </a>
            </p>
            <p>Clustered heatmap of related genomes reveals outbreaks over multiple wards.</p>
            <p class="secondary"><strong>Figure 2</strong> in 
              <a target="_blank" href="https://genomemedicine.biomedcentral.com/articles/10.1186/s13073-020-00798-3#Fig2">
                Berbel Caban &amp; Pak, et al.</a></p>
          </div>
        </div>
        <div class="col">
          <div class="col-content center">
            <p>
              <a target="_blank" href="?fig=3">
                <img src="images/timeline.png" class="figure shadow"/>
              </a>
            </p>
            <p>A timeline of spatiotemporal movements and overlaps of patients in the largest cluster.</p>
            <p class="secondary"><strong>Figure 3</strong> in
              <a target="_blank" href="https://genomemedicine.biomedcentral.com/articles/10.1186/s13073-020-00798-3#Fig3">
                Berbel Caban &amp; Pak, et al.</a></p>
          </div>
        </div>
        <div class="clear"></div>
      </div>
      <div class="container cols-2">
        <div class="col">
          <div class="col-content center">
            <p>
              <a target="_blank" href="?fig=S1">
                <img src="images/network.png" class="figure shadow"/>
              </a>
            </p>
            <p>Animated network diagram showing the spatial relationships among related genomes over time.</p>
            <p class="secondary"><strong>Figure S1</strong> in
              <a target="_blank" href="https://genomemedicine.biomedcentral.com/articles/10.1186/s13073-020-00798-3#Sec15">
                Berbel Caban &amp; Pak, et al.</a></p>
          </div>
        </div>
        <div class="col">
          <div class="col-content center">
            <p>
              <a target="_blank" href="?fig=S3B">
                <img src="images/dendro-timeline.png" class="figure shadow"/>
              </a>
            </p>
            <p>A 7-day overlap in inpatient ward stays precedes a transmission event detected one year later.</p>
            <p class="secondary"><strong>Figure S3B</strong> in
              <a target="_blank" href="https://genomemedicine.biomedcentral.com/articles/10.1186/s13073-020-00798-3#Sec15">
                Berbel Caban &amp; Pak, et al.</a></p>
          </div>
        </div>
        <div class="clear"></div>
      </div>
      <p class="center mid-width">
        <span class="regular">Interested in viruses?</span> See our <a href="https://doi.org/10.1093/cid/ciaa1781" target="_blank">influenza A investigation in <em>CID</em></a>, where <span class="regular">pathoSPOT</span> characterized a nosocomial outbreak affecting 66 patients and healthcare workers and identified &ldquo;patient zero.&rdquo;
      </p>
    </div>
      
    <h2 class="center mid-width new-section">
      <a id="get-started">Get Started</a>
    </h2>
    <div class="container cols-1">
      <p>
        You can use <span class="regular">pathoSPOT</span> to analyze your own pathogen genomes<span class="product-splash product-splash-inline"> and create visualizations similar to the ones above</span>. As a tutorial, we will reproduce the analysis in <a target="_blank" href="https://www.medrxiv.org/content/10.1101/2020.05.11.20098103v1">Berbal Caban &amp; Pak et al.</a> starting from the <a href="https://pathospot.org/data/mrsa.tar.gz">raw data (tar.gz)</a>.
      </p>
      <p>
        This dataset contains FASTA sequences for 226 MRSA genomes, gene annotations in BED format, and a <a href="https://github.com/powerpak/pathospot-compare/blob/master/README-database.md">relational database</a> (in <a href="https://www.sqlite.org/">SQLite</a> format) with metadata for each genome (anonymized patient IDs, collection locations, healthcare encounters for each patient, and more).
      </p>
      <p>
        <span class="regular">pathoSPOT</span> is designed to run on Linux; however, we provide a Vagrant configuration so that anybody, including Mac and Windows users, can quickly create a virtual machine (VM) that runs the pipeline either on their personal computer or on the <a href="https://github.com/powerpak/pathospot-compare/blob/master/README-vagrant-aws.md">Amazon EC2 cloud</a>. We'll use VirtualBox to run the VM locally for this example; you'll need 5GB of disk space and 8GB of RAM.
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
        If everything worked, you should see <code>vagrant@stretch:/vagrant$</code> which is a shell running on your brand new Linux VM. The VM has already downloaded the example dataset, which you will find inside <code>/vagrant/example</code>.
      </p>
      <p>
        <span class="regular">By default</span>, the VM is configured to run a full analysis on those data, which you can kick off with:
      </p>
      <div class="code-block">
        <pre>$ rake all
<span class="output">... More output, takes 1/2 to 2 hours. The last line should be ...
WARN: re-invoking parsnp task since the mash clusters were rebuilt</span>
$</pre>
      </div>
      <p>
        When it's finished, open <a href="http://localhost:8989">http://localhost:8989</a> in your browser. (It will look exactly like this website, except the
        <a href="#live-demo" class="product-splash product-splash-inline">Try it Now</a>
        <a href="#available-datasets" class="available-datasets">Try it Now</a>
        section will be replaced by the datasets and analysis produced by your VM.)
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
      <p><strong>How do I cite this?</strong> If you use <span class="regular">pathoSPOT</span> for your own research, we would appreciate if you reference:</p>
      <ul>
        <li>Berbel Caban A, Pak TR, Obla A et al. <a href="https://genomemedicine.biomedcentral.com/articles/10.1186/s13073-020-00798-3">PathoSPOT genomic epidemiology reveals under-the-radar nosocomial outbreaks.</a> <em>Genome Med.</em> 2020 Nov 16;<span class="regular">12</span>(1):96. PMID:<a href="https://pubmed.ncbi.nlm.nih.gov/33198787/">33198787</a> doi:10.1186/s13073-020-00798-3
        </li>
      </ul>
      <p>The influenza A outbreak investigation can be cited as follows:</p>
      <ul>
        <li>Javaid W, Ehni J, Gonzalez-Reiche AS et al. <a href="https://doi.org/10.1093/cid/ciaa1781">Real-Time Investigation of a Large Nosocomial Influenza A Outbreak Informed by Genomic Epidemiology.</a> <em>Clin Infect Dis.</em> 2020 Nov 30;ciaa1781. PMID:<a href="https://pubmed.ncbi.nlm.nih.gov/33252647/">33252647</a> doi:10.1093/cid/ciaa1781
        </li>
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

