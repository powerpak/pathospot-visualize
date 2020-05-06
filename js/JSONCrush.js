/////////////////////////////////////////////////////////////////////// 
// JSONCrush by Frank Force [MIT] https://github.com/KilledByAPixel/JSONCrush
/////////////////////////////////////////////////////////////////////// 

// Downgraded to ES5 with BabelJS

"use strict"; // strict mode

function _createForOfIteratorHelper(o) { if (typeof Symbol === "undefined" || o[Symbol.iterator] == null) { if (Array.isArray(o) || (o = _unsupportedIterableToArray(o))) { var i = 0; var F = function F() {}; return { s: F, n: function n() { if (i >= o.length) return { done: true }; return { done: false, value: o[i++] }; }, e: function e(_e) { throw _e; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var it, normalCompletion = true, didErr = false, err; return { s: function s() { it = o[Symbol.iterator](); }, n: function n() { var step = it.next(); normalCompletion = step.done; return step; }, e: function e(_e2) { didErr = true; err = _e2; }, f: function f() { try { if (!normalCompletion && it.return != null) it.return(); } finally { if (didErr) throw err; } } }; }

function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }

function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) { arr2[i] = arr[i]; } return arr2; }

// IMPORTANT: Modified this so that you can optionally NOT encodeURIComponent the output
function JSONCrush(string, dontEncodeForURI) {
  var maxSubstringLength = 50; // speed it up by limiting max length

  var delimiter = "\x01"; // used to split parts of crushed string

  var JSCrush = function JSCrush(string, replaceCharacters) {
    // JSCrush Algorithm (repleace repeated substrings with single characters)
    var replaceCharacterPos = replaceCharacters.length;
    var splitString = '';

    var ByteLength = function ByteLength(string) {
      return encodeURI(encodeURIComponent(string)).replace(/%../g, 'i').length;
    };

    var HasUnmatchedSurrogate = function HasUnmatchedSurrogate(string) {
      // check ends of string for unmatched surrogate pairs
      var c1 = string.charCodeAt(0);
      var c2 = string.charCodeAt(string.length - 1);
      return c1 >= 0xDC00 && c1 <= 0xDFFF || c2 >= 0xD800 && c2 <= 0xDBFF;
    }; // count instances of substrings


    var substringCount = {};

    for (var substringLength = 2; substringLength < maxSubstringLength; substringLength++) {
      for (var i = 0; i < string.length - substringLength; ++i) {
        var substring = string.substr(i, substringLength); // don't recount if already in list

        if (substringCount[substring]) continue; // prevent breaking up unmatched surrogates

        if (HasUnmatchedSurrogate(substring)) continue; // count how many times the substring appears

        var count = 1;

        for (var substringPos = string.indexOf(substring, i + substringLength); substringPos >= 0; ++count) {
          substringPos = string.indexOf(substring, substringPos + substringLength);
        } // add to list if it appears multiple times


        if (count > 1) substringCount[substring] = count;
      }
    }

    while (true) // loop while string can be crushed more
    {
      // get the next character that is not in the string
      for (; replaceCharacterPos-- && string.includes(replaceCharacters[replaceCharacterPos]);) {}

      if (replaceCharacterPos < 0) break; // ran out of replacement characters

      var replaceCharacter = replaceCharacters[replaceCharacterPos]; // find the longest substring to replace

      var bestSubstring = void 0;
      var bestLengthDelta = 0;
      var replaceByteLength = ByteLength(replaceCharacter);

      for (var _substring in substringCount) {
        // calculate change in length of string if it substring was replaced
        var _count = substringCount[_substring];
        var lengthDelta = (_count - 1) * ByteLength(_substring) - (_count + 1) * replaceByteLength;
        if (!splitString.length) lengthDelta -= ByteLength(delimiter); // include the delimeter length 

        if (lengthDelta <= 0) delete substringCount[_substring];else if (lengthDelta > bestLengthDelta) {
          bestSubstring = _substring;
          bestLengthDelta = lengthDelta;
        }
      }

      if (!bestSubstring) break; // string can't be compressed further
      // create new string with the split character

      string = string.split(bestSubstring).join(replaceCharacter) + replaceCharacter + bestSubstring;
      splitString = replaceCharacter + splitString; // update substring count list after the replacement

      var newSubstringCount = {};

      for (var _substring2 in substringCount) {
        // make a new substring with the replacement
        var newSubstring = _substring2.split(bestSubstring).join(replaceCharacter); // count how many times the new substring appears


        var _count2 = 0;

        for (var _i = string.indexOf(newSubstring); _i >= 0; ++_count2) {
          _i = string.indexOf(newSubstring, _i + newSubstring.length);
        } // add to list if it appears multiple times


        if (_count2 > 1) newSubstringCount[newSubstring] = _count2;
      }

      substringCount = newSubstringCount;
    }

    return {
      a: string,
      b: splitString
    };
  }; // create a string of replacement characters


  var characters = []; // prefer replacing with characters that will not be escaped by encodeURIComponent

  var unescapedCharacters = "-_.!~*'()";

  for (var i = 127; --i;) {
    if (i >= 48 && i <= 57 || // 0-9
    i >= 65 && i <= 90 || // A-Z
    i >= 97 && i <= 122 || // a-z
    unescapedCharacters.includes(String.fromCharCode(i))) characters.push(String.fromCharCode(i));
  } // pick from extended set last


  for (var _i2 = 32; _i2 < 255; ++_i2) {
    var c = String.fromCharCode(_i2);
    if (c != '\\' && !characters.includes(c)) characters.unshift(c);
  } // remove delimiter if it is found in the string


  string = string.replace(new RegExp(delimiter, 'g'), ''); // swap out common json characters

  string = JSONCrushSwap(string); // crush with JS crush

  var crushed = JSCrush(string, characters); // insert delimiter between JSCrush parts

  var crushedString = crushed.a;
  if (crushed.b.length) crushedString += delimiter + crushed.b; // encode URI

  return dontEncodeForURI ? crushedString : encodeURIComponent(crushedString);
}

function JSONUncrush(string) {
  // string must be a decoded URI component, searchParams.get() does this automatically
  // unsplit the string using the delimiter
  var stringParts = string.split("\x01"); // JSUncrush algorithm

  var uncrushedString = stringParts[0];

  if (stringParts.length > 1) {
    var splitString = stringParts[1];

    var _iterator = _createForOfIteratorHelper(splitString),
        _step;

    try {
      for (_iterator.s(); !(_step = _iterator.n()).done;) {
        var character = _step.value;
        // split the string using the current splitCharacter
        var splitArray = uncrushedString.split(character); // rejoin the string with the last element from the split

        uncrushedString = splitArray.join(splitArray.pop());
      }
    } catch (err) {
      _iterator.e(err);
    } finally {
      _iterator.f();
    }
  } // unswap the json characters in reverse direction


  return JSONCrushSwap(uncrushedString, 0);
}

function JSONCrushSwap(string) {
  var forward = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 1;
  // swap out characters for lesser used ones that wont get escaped
  var swapGroups = [['"', "'"], ["':", "!"], [",'", "~"], ['}', ")", '\\', '\\'], ['{', "(", '\\', '\\']];

  var Swap = function Swap(string, g) {
    var regex = new RegExp("".concat((g[2] ? g[2] : '') + g[0], "|").concat((g[3] ? g[3] : '') + g[1]), 'g');
    return string.replace(regex, function ($1) {
      return $1 === g[0] ? g[1] : g[0];
    });
  }; // need to be able to swap characters in reverse direction for uncrush


  if (forward) for (var i = 0; i < swapGroups.length; ++i) {
    string = Swap(string, swapGroups[i]);
  } else for (var _i3 = swapGroups.length; _i3--;) {
    string = Swap(string, swapGroups[_i3]);
  }
  return string;
}