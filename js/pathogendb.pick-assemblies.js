function pickAssemblies(isolates, assemblyNames, whichTree) {
  
  var $filter = $('#filter'),
      $listLeft = $('#list-left'),
      $listRight = $('#list-right'),
      $addAll = $('#add-all'),
      $removeAll = $('#remove-all'),
      $plotBtn = $('#plot-assemblies');
  var filterTypes = [
        {pluck: 'isolate_ID', option_text: 'isolate ID'},
        {pluck: 'mlst_subtype',
            pluck_map: function(arr) { return _.reject(_.map(arr, function(v) { return parseInt(v, 10); }), _.isNaN); },
            no_compact: true,
            option_text: 'MLST'},
        {pluck: 'collection_unit', option_text: 'unit'},
        {pluck: 'eRAP_ID', option_text: 'pt ID'},
        {pluck: 'tree', no_compact: true, option_text: 'Mash cluster'},
        {pluck: 'assembly_ID', option_text: 'assembly ID'}
      ];
  var FORMAT_FOR_DISPLAY = {
        collection_unit: fixUnit
      };
      
  _.each(whichTree, function(treeNum, assemblyName) {
    isolates[assemblyName].tree = treeNum;
  });
  
  function setupFilterSelect2() {
    _.each(filterTypes, function(settings) {
      var range = _.pluck(isolates, settings.pluck);
      if (settings.pluck_map) { range = settings.pluck_map(range); }
      if (!settings.no_compact) { range = _.compact(range); }
      range = _.sortBy(_.uniq(range));
    
      var $optgroup = $('<optgroup/>').appendTo($filter);
      $optgroup.attr('label', "Filter by " + settings.option_text);
      var capitalized = settings.option_text.charAt(0).toUpperCase() + settings.option_text.slice(1);
      _.each(range, function(val) { 
        $optgroup.append('<option value="' + settings.pluck + ':' + val + '">' + capitalized + ': ' + val + '</option>'); 
      });
    });
  
    $filter.select2({placeholder: "Type here to add/remove filters"})
    $filter.parent().find('.select2-selection').append(
        '<span class="select2-selection__arrow" role="presentation"><b role="presentation"></b></span>');
    $filter.on('change', changeIsolatesFilter);
    $filter.change();
  }
  
  function filterIsolates(isolates) {
    var filters = getFilters($filter),
        filteredIsolates = isolates;
    
    // Filters of the same type are OR'ed, filters of different types are AND'ed
    _.each(filterTypes, function(settings) {
      var field = settings.pluck;
      if (filters[field] && filters[field].length) {
        filteredIsolates = _.filter(filteredIsolates, function(isolate) { 
          return _.contains(filters[field], isolate[field] !== null ? isolate[field].toString() : null); 
        });
      }
    });
    return filteredIsolates;
  }
  
  function setupBtn(el) {
    $(el).mousedown(function() {
      var $el = $(this);
      $el.addClass('active');
      $('body').one('mouseup', function() { $el.removeClass('active'); });
    });
  }
  
  function getCurrentTree() {
    if (!assemblyNames.length) { return null; }
    var treeNums = _.map(assemblyNames, function(name) { return isolates[name].tree; });
    if (_.uniq(treeNums).length > 1) { throw "Never supposed to have isolates from different trees on the right!"; }
    return treeNums[0];
  }
  
  function updateIsolatesList(sel, isolatesOrNames, isRight, iconClass) {
    var $tab = $(sel).eq(0),
        selected = isolatesOrNames,
        cols = ['tree', 'isolate_ID', 'eRAP_ID', 'order_date', 'collection_unit'],
        currentTree = getCurrentTree();
    
    if (selected[0] && typeof selected[0] == "string") {
      selected = _.filter(isolates, function(iso) { return _.contains(selected, iso.name); });
    }
    
    $tab.find('tr:not(:first)').remove();
    _.each(selected, function(iso) {
      var $tr = $('<tr/>').data('assembly_name', iso.name),
          $btnTd = $('<td/>').addClass('btn-col noselect');
      
      _.each(cols, function(col) {
        var val = FORMAT_FOR_DISPLAY[col] ? FORMAT_FOR_DISPLAY[col](iso[col]): iso[col];
        $('<td/>').text(val).addClass(fixForClass(col)).appendTo($tr);
      });
      
      $('<i/>').attr('class', iconClass).appendTo($btnTd);
      if (isRight) { $btnTd.prependTo($tr); }
      else { 
        if (currentTree !== null && iso.tree !== currentTree) { $tr.addClass('disabled'); }
        $btnTd.appendTo($tr); 
      }
      setupBtn($btnTd);
      
      $tr.appendTo($tab);
    });
  }
  
  function changeIsolatesFilter() {
    var filteredIsolates = filterIsolates(isolates);
    filteredIsolates = _.reject(filteredIsolates, function(iso) { return _.contains(assemblyNames, iso.name); });
    
    updateIsolatesList($listLeft, filteredIsolates, false, "icon ion-md-add-circle");
    updateIsolatesList($listRight, assemblyNames, true, "icon ion-md-remove-circle");
    $addAll.toggleClass('disabled', getCurrentTree() === null);
    
    $plotBtn.attr('href', window.location.pathname + '?db=' + db + '&assemblies=' + assemblyNames.join('+'));
  }
  
  function setupIsolateLists() {
    $listLeft.click(function(e) {
      var $tr = $(e.target).closest('tr');
      if ($(e.target).closest('.btn-col').length && !$tr.hasClass('disabled')) {
        var assemblyName = $tr.data('assembly_name');
        assemblyNames.push(assemblyName);
        $filter.change();
      }
    });
    
    $listRight.click(function(e) {
      if ($(e.target).closest('.btn-col').length) {
        var assemblyName = $(e.target).closest('tr').data('assembly_name');
        assemblyNames = _.reject(assemblyNames, function(n) { return n === assemblyName; });
        $filter.change();
      }
    });
    
    $addAll.click(function() {
      if ($(this).hasClass('disabled')) { return; }
      $listLeft.find('tr').slice(1).not('.disabled').each(function() {
        assemblyNames.push($(this).data('assembly_name'));
      });
      $filter.change();
    });
    $removeAll.click(function() {
      assemblyNames = [];
      $filter.change();
    });
  }
  
  setupFilterSelect2();
  setupIsolateLists();

}