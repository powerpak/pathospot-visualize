#!/usr/bin/env ruby
#
# A helper for generating grid layouts of units named Ward 1, Ward 2, etc.
# for .json map files

def make_map_json_snippet(prefix, count, xmin, ymin, xmax, ymax)
  width = xmax - xmin
  height = ymax - ymin
  
  x_breaks = 0
  y_breaks = 0
  while (x_breaks + 1) * (y_breaks + 1) < count
    next_x_unit = width.to_f / (x_breaks + 1)
    next_y_unit = height.to_f / (y_breaks + 1)
    if next_y_unit > next_x_unit
      y_breaks += 1
    else
      x_breaks += 1
    end
  end
  
  x_unit = width.to_f / x_breaks
  y_unit = height.to_f / y_breaks
  
  (0..y_breaks).each do |i|
    (0..x_breaks).each do |j|
      item_num = i * (x_breaks + 1) + j + 1
      next unless item_num <= count
      x = xmin + (x_unit.finite? ? j * x_unit : 0)
      y = ymin + (y_unit.finite? ? i * y_unit : 0)
      puts "  \"#{prefix} #{item_num}\": [#{x.to_i}, #{y.to_i}],"
    end
  end
end

if __FILE__ == $0
  if ARGV.size < 6
    STDERR.puts <<-HELP
USAGE:

./grid-generator.rb PREFIX COUNT X_MIN Y_MIN X_MAX Y_MAX

Pipe to pbcopy if you want to be able to paste it into a .json map.

HELP
  else
    make_map_json_snippet ARGV[0], *ARGV[1..-1].map{|arg| arg.to_i }
  end
end