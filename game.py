# Click in the righthand window to make it active then use your arrow
# keys to control the spaceship!
import turtle
import math
import random
import time

print("Welcome to my game! How to play: \
 Use the W key to add thrust and A and D keys to turn. Use the S key to stop, but if you do, you lose 1 point.\
 If you collect a coin, you get 3 points.\
 You lose 2 points by falling off the side, and 5 points for entering a black hole.\
 The game ends after you reach a score of 20. Good Luck!")

screen = turtle.Screen()
screen.setup(800, 800)

# Images only load in environments that support them (trinket.io, or GIFs
# locally). If they fail, fall back to plain turtle shapes so the game runs.
def use_image(name, fallback):
  try:
    screen.addshape(name)
    return name
  except Exception:
    return fallback

try:
  screen.bgpic("space.jpg")
except Exception:
  screen.bgcolor("black")

ship_shape = use_image("rocketship.png", "triangle")
coin_shape = use_image("coin1.png", "circle")
hole_shape = use_image("black hole.png", "circle")

coin = turtle.Turtle()
coin.penup()
coin.speed(0)
coin.shape(coin_shape)
if coin_shape == "circle":
  coin.color("gold")

blackhole = turtle.Turtle()
blackhole.penup()
blackhole.speed(0)
blackhole.shape(hole_shape)
if hole_shape == "circle":
  blackhole.color("purple")
  blackhole.shapesize(2)

turtle.shape(ship_shape)
if ship_shape == "triangle":
  turtle.color("white")

blackholex = 4
blackholey = 4

coinx = 1
coiny = 1

score = 0

start_time = time.time()

movex = 0
movey = 0

def forward():
  global movey
  global movex
  global score
  y = turtle.ycor() + movey
  x = turtle.xcor() + movex
  turtle.setx(x)
  turtle.sety(y)

  global blackholex
  global blackholey
  if blackhole.xcor() > 400 or blackhole.xcor() < -400:
    blackholex = blackholex * -1

  if blackhole.ycor() > 400 or blackhole.ycor() < -400:
    blackholey = blackholey * -1

  by = blackhole.ycor() + blackholey
  bx = blackhole.xcor() + blackholex

  blackhole.setx(bx)
  blackhole.sety(by)

  global coinx
  global coiny
  if coin.xcor() > 400 or coin.xcor() < -400:
    coinx = coinx * -1

  if coin.ycor() > 400 or coin.ycor() < -400:
    coiny = coiny * -1

  cy = coin.ycor() + coiny
  cx = coin.xcor() + coinx

  coin.setx(cx)
  coin.sety(cy)

  if turtle.xcor() > 400 or turtle.xcor() < -400 or turtle.ycor() > 400 or turtle.ycor() < -400:
    score -= 2
    print("SCORE:")
    print(score)
    turtle.setx(0)
    turtle.sety(0)
    movex = 0
    movey = 0

  if score >= 20:
    print("Game Over! Your total score is " + str(score))
    gametime = time.time() - start_time
    print("It took you " + str(gametime) + " seconds.")
    print("To play again, refresh the page.")
    exit()

def updatevelocity(angle):
  global movey
  global movex
  angle = angle * (math.pi / 180)
  x = math.cos(angle) * 0.1
  y = math.sin(angle) * 0.1
  movey = movey + y
  movex = movex + x

def stop():
  global movey
  global movex
  global score
  movex = 0
  movey = 0
  score = score - 1
  print("SCORE:")
  print(score)

def collectcoin():
  global score
  if abs(coin.xcor() - turtle.xcor()) < 40 and abs(coin.ycor() - turtle.ycor()) < 40:
    coin.goto(random.randint(-400, 400), random.randint(-400, 400))
    score += 3
    print("SCORE:")
    print(score)
    blackhole.goto(random.randint(-400, 400), random.randint(-400, 400))

def enterblackhole():
  global score
  if abs(blackhole.xcor() - turtle.xcor()) < 50 and abs(blackhole.ycor() - turtle.ycor()) < 50:
    blackhole.goto(random.randint(-400, 400), random.randint(-400, 400))
    score = score - 5
    print("SCORE:")
    print(score)

def left():
  turtle.left(10)

def right():
  turtle.left(-10)

def thrust():
  updatevelocity(turtle.heading())

coin.goto(random.randint(-400, 400), random.randint(-400, 400))
blackhole.goto(random.randint(-400, 400), random.randint(-400, 400))

turtle.penup()
turtle.speed(0)
turtle.home()
print("SCORE:")
print(score)

screen.onkey(thrust, "w")
screen.onkey(left, "a")
screen.onkey(right, "d")
screen.onkey(stop, "s")
screen.listen()

# Draw manually so screen.update() controls the frame rate.
screen.tracer(0)

while True:
  forward()
  collectcoin()
  enterblackhole()
  screen.update()
  time.sleep(0.02)
