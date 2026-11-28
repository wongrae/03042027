// Hand-made layout for the photo field, written by the layout editor
// (npm run serve, then open http://localhost:8080/__layout-editor/).
// null = use the automatic arrangement (afterduskmedia.com's block).
// Sizes are px of a 500px-wide frame (about a phone screen); x, y are each
// photo's centre and w its width (its height follows its own shape). Higher z = on top.
export const photoLayout = {
  width: 500,
  height: 1600,
  shift: 800, // how far down each sideways repeat of the frame is moved
  photos: [
    {"src":"./img/photo-field/08.jpg","x":295.1,"y":345.4,"w":142,"z":1},
    {"src":"./img/photo-field/19.jpg","x":70,"y":1218.2,"w":142,"z":2},
    {"src":"./img/photo-field/17.jpg","x":402.2,"y":644.1,"w":167,"z":3},
    {"src":"./img/photo-field/20.jpg","x":273.2,"y":1326.4,"w":169.5,"z":4},
    {"src":"./img/photo-field/02.jpg","x":437,"y":1278.9,"w":144.9,"z":5},
    {"src":"./img/photo-field/07.jpg","x":449,"y":455.6,"w":104,"z":6},
    {"src":"./img/photo-field/18.jpg","x":424.5,"y":1494.5,"w":104,"z":7},
    {"src":"./img/photo-field/03.jpg","x":409.7,"y":73.4,"w":207.7,"z":8},
    {"src":"./img/photo-field/10.jpg","x":206.4,"y":776.5,"w":190.1,"z":9},
    {"src":"./img/photo-field/14.jpg","x":268.7,"y":1522.2,"w":190.1,"z":10},
    {"src":"./img/photo-field/04.jpg","x":79.4,"y":108.5,"w":168,"z":11},
    {"src":"./img/photo-field/15.jpg","x":139.5,"y":965.3,"w":168,"z":12},
    {"src":"./img/photo-field/13.jpg","x":428.5,"y":267.5,"w":172,"z":13},
    {"src":"./img/photo-field/16.jpg","x":412.9,"y":860.8,"w":172,"z":14},
    {"src":"./img/photo-field/05.jpg","x":101.5,"y":416.6,"w":229.9,"z":15},
    {"src":"./img/photo-field/06.jpg","x":324.5,"y":1071.2,"w":229.9,"z":16},
    {"src":"./img/photo-field/09.jpg","x":73.9,"y":662.1,"w":182,"z":17},
    {"src":"./img/photo-field/11.jpg","x":93.9,"y":1424.3,"w":182,"z":18},
    {"src":"./img/photo-field/01.jpg","x":222.3,"y":112.8,"w":138,"z":19},
    {"src":"./img/photo-field/12.jpg","x":281.2,"y":585,"w":138,"z":20},
  ],
};
