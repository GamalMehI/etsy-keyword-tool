const { norm } = require('./util');
const TRADEMARK = ['disney','mickey','minnie','marvel','pokemon','nintendo','mario','zelda','harry potter','hogwarts','taylor swift','swiftie','eras tour','barbie','bluey','peppa','paw patrol','stanley','nike','adidas','nfl','nba','mlb','nhl','star wars','lego','hello kitty','sanrio','friends tv','the office','grinch','dr seuss','minecraft','roblox','fortnite','stitch','frozen','elsa','spiderman','batman','superman','coca cola','starbucks','tiffany','louis vuitton','gucci','chanel','yeti','crocs','squishmallow','labubu'];
const trademarkPattern=new RegExp(TRADEMARK.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'));
const hasTrademark = kw => trademarkPattern.test(norm(kw));

module.exports = { TRADEMARK, hasTrademark };
