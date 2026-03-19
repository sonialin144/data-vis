function setup() {
  createCanvas(windowWidth, windowHeight);
}

function draw() {
  background(24);
  fill(0, 200, 255);
  noStroke();
  circle(mouseX, mouseY, 48);

  fill(255);
  textSize(16);
  text("p5.js environment ready", 24, 36);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
