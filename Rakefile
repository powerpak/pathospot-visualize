directory "build"
JAVASCRIPTS = ["build/hclust.js"]
def sources_for_javascript(js)
  Dir.glob('js/**/*.js').sort_by{ |src| src.match(/#{File.basename js}$/) ? -1 : 1 }
end
rule /^build\/.+\.js$/ => proc { |js| sources_for_javascript(js) + ["build"] } do |t|
  sh "browserify -d #{t.sources.first} -o #{t.name}"
end

task :browserify => JAVASCRIPTS