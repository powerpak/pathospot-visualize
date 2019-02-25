function fixUnit(unit) {
  if (unit) {
    unit = unit.replace(/MOUNT SINAI HOSPITAL +/, 'HOSP ');
    unit = unit.replace(/EMERGENCY (DEPARTMENT|DEPT)/, 'ED');
    unit = unit.replace(/INITIAL DEPARTMENT/, '??');
    unit = unit.replace(/NS INTERNAL MEDICINE/, 'NS IM');
    unit = unit.replace(/INTERVENTIONAL RADIOLOGY/, 'IR');
    unit = unit.replace(/^FPA.*/, 'FPA');
    unit = unit.replace(/^(MSQ \d) (E|W)[AE]ST/, '$1$2');
    if (window.ANON) { unit = rot13(unit); }
  }
  return unit;
}

// turns an array of arrays, where the first is a list of fieldnames, into an array of objects
// e.g. [["a", "b", "c"], [1, 2, 3], [4, 5, 6], ...] => [{a: 1, b: 2, c: 3}, {a: 4, b: 5, c: 6}, ...]
function tabularIntoObjects(arr) {
  return _.map(arr.slice(1), function(v) { return _.object(arr[0], v); });
}

function fixForClass(value) {
  return value.replace(/\W/g, '-');
}

function formatDate(d) {
  if (!d) { return ''; }
  d = new Date(d);
  return d.getFullYear() + '-' + ("0" + (d.getMonth() + 1)).slice(-2) + '-' + ("0" + d.getDate()).slice(-2);
}

function formatPercentages(d) {
  if (_.isUndefined(d) || _.isNull(d)) { return ''; }
  if (!_.isArray(d)) { d = [d]; }
  return _.map(d, function(v) { return v.toFixed(1); }).join('&mdash;') + '%';
}

function formatClusterNumber(d) {
  if (_.isUndefined(d) || _.isNull(d)) { return ''; }
  var clusterColor = $('a.cluster-' + d).css('background-color');
  d = d.toString();
  if (clusterColor) { d = '<span class="cluster-color" style="background-color:' + clusterColor + '"></span> ' + d; }
  return d;
}

// one-liner from http://stackoverflow.com/questions/11582512/how-to-get-url-parameters-with-javascript/11582513
function getURLParameter(name) {
  return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)')
      .exec(location.search) || [null, ''])[1]
      .replace(/\+/g, '%20')) || null;
}

function numberWithCommas(x) {
  return (_.isNull(x) ? '' : x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function rot13(s) {
  return s.replace(/[a-zA-Z]/g,function(c){return String.fromCharCode((c<="Z"?90:122)>=(c=c.charCodeAt(0)+13)?c:c-26);});
}

function parseInt10(s) { 
  return parseInt(s, 10);
}

function stringifyTuple(tuple) {
  return tuple.join("\n");
}

function getFilters(sel) {
  var filters = $(sel).val(),
      out = {};
  _.each(filters, function(filter) {
    var pair = filter.split(':');
    if (pair.length > 1) {
      out[pair[0]] = out[pair[0]] || [];
      if (!_.isArray(out[pair[0]])) { throw "Cannot have a filter that is both a flag and value-based." }
      out[pair[0]].push(pair[1]);
    } else {
      out[pair[0]] = true;
    }
  });
  return out;
}

Array.prototype.swap = function(x, y) {
  var b = this[x];
  this[x] = this[y];
  this[y] = b;
  return this;
}

Array.prototype.sum = function() {
  return _.reduce(this, function(a, b) { return a + b; }, 0);
}

// Given an SVG element, or a d3 selection containing SVG elements, returns the bounding box of the element
// in pixel units relative to the top left corner of the containing SVG element
function getBBox(elem) {
  if (d3 && elem instanceof d3.selection) { elem = elem.node(); }
  var point = elem.ownerSVGElement.createSVGPoint();
      bbox = {},
      matrix = elem.getCTM(),
      tbbox = elem.getBBox(),
      width = tbbox.width,
      height = tbbox.height,
      x = tbbox.x,
      y = tbbox.y;

  point.x = x;
  point.y = y;
  bbox.x = point.matrixTransform(matrix).x;
  bbox.y = point.matrixTransform(matrix).y;
  point.x += width;
  bbox.width = point.matrixTransform(matrix).x - bbox.x;
  point.y += height;
  bbox.height = point.matrixTransform(matrix).y - bbox.y;
  
  return bbox;
}

// Helper function for performant animations with requestAnimationFrame (instead of setInterval)
// https://hacks.mozilla.org/2011/08/animating-with-javascript-from-setinterval-to-requestanimationframe/
// @param render: function(deltaT, now) {}  -- called every frame to render changes;
//                                             should return false when the animation is over to stop looping
// @param element: DOMElement               -- optional, sets the element within which the animation runs
function animLoop(render, element) {
  var running, lastFrame = +(new Date()),
      raf = window.requestAnimationFrame       ||
            window.mozRequestAnimationFrame    ||
            window.webkitRequestAnimationFrame ||
            window.msRequestAnimationFrame     ||
            window.oRequestAnimationFrame;
          
  function loop(now) {
    if (running !== false) {
      raf ?
        raf(loop, element) :
        // fallback to setTimeout
        setTimeout(loop, 16);
      // Make sure to use a valid time, since:
      // - Chrome 10 doesn't return it at all
      // - setTimeout returns the actual timeout
      now = now && now > 1E4 ? now : +new Date;
      var deltaT = now - lastFrame;
      // do not render frame when deltaT is too high, and avoid nonsense negative deltaT's
      if (deltaT > 0 && deltaT < 160) {
        running = render(deltaT, now);
      }
      lastFrame = now;
    }
  }
  loop();
};