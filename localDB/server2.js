import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth2";
import session from "express-session";
import env from "dotenv";
import { generateFromEmail } from "unique-username-generator";
import * as http from 'node:http';
import { Server } from "socket.io";
import formatMessage from '../utils/messages.js';
import {userJoin, getCurrentUser, userLeave, getRoomUsers} from '../utils/users.js';

import cookieParser from "cookie-parser";

const app = express();
const port = process.env.PORT || 3000;
const botName = "ChatterooBot"

// Socket connections
const server = http.createServer(app);
const io = new Server(server);

// Starts when client connects
io.on('connection', socket => {
  // Join Room
  socket.on('joinRoom', ({username, room}) => {
    const user = userJoin(socket.id, username, room);
    socket.join(user.room);

    socket.emit('message', formatMessage(botName, 'Welcome to Chatteroo'));

    // Broadcast when a user connects
    socket.broadcast.to(user.room).emit('message', formatMessage(botName, `${username} has joined the chat`));
    
    // Send room and user info
    io.to(user.room).emit("roomUsers", {
      room: user.room,
      users: getRoomUsers(user.room)
    });
  })
  
  // Listen for chat message
  socket.on('chatMessage', (msg) => {
    const user = getCurrentUser(socket.id)
    io.to(user.room).emit('message', formatMessage(user.username, msg));
  });

    // When client disconnects
    socket.on('disconnect', () => {
      const user = userLeave(socket.id);
      if (user) {
        io.to(user.room).emit('message', formatMessage(botName, `${user.username} has left the chat`));
        io.to(user.room).emit("roomUsers", {
          room: user.room,
          users: getRoomUsers(user.room),
        });
      }
    })
});

const saltRounds = 10;
env.config();

app.use(express.static('public'));
app.use(bodyParser.urlencoded({extended: true}))
app.set('view engine', 'ejs');

app.use(
    session({
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: true,
      cookie: {
        maxAge: 1000 * 60 * 60 * 24,
      }
    })
);

app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
});
db.connect();

app.get("/", (req, res) => {
    res.render('index.ejs');
})

app.get("/register", (req, res) => {
    res.render('register.ejs');
})

app.get("/login", (req, res) => {
    res.render('login.ejs');
})

app.get("/logout", (req, res) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

app.get("/home", async (req, res) => {
  if (req.isAuthenticated()) {
    try {
      const result = await db.query("SELECT username FROM users WHERE email = $1", [req.user.email]);
      // console.log(result);
      let newName = "";
    if (result.rows[0].username != null) {
      // console.log("entered 1");
      newName = result.rows[0].username;
    } else {
      // console.log("entered 2");
      newName = generateFromEmail(
        req.user.email,
        3
      );
    }
    // console.log(newName);
    res.render("home.ejs", { username: newName });
    } catch (err) {
      console.log(err);
    }
  } else {
    res.redirect("/logout");
  }
})

app.get("/chat", async (req, res) => {
  if (req.isAuthenticated()) {
      // const result = await db.query("SELECT username FROM users WHERE email = $1", [req.user.email]);
      const currUser = req.body.username;
      const room = req.body.room;
      console.log(req.body);
      try {
        const result = await db.query("UPDATE users SET username = $1 WHERE email = $2 RETURNING *", [req.body.username, req.user.email]);
        res.render("chat.ejs", {username: currUser, room: room});
      } catch(err) {
        console.log(err);
      }
  } else {
    res.redirect("/logout");
  }
})

app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

app.get(
  "/auth/google/chatteroo",
  passport.authenticate("google", {
    successRedirect: "/home",
    failureRedirect: "/login",
  })
);

app.post("/login",
    passport.authenticate("local", {
      successRedirect: "/home",
      failureRedirect: "/register",
    }),
);

app.post("/register", async (req, res) => {
    const email = req.body.email;
    let password = "";
    if (req.body.password === req.body.confirmPassword) {
        password = req.body.password;
    } else {
        res.render("register.ejs");
    }
    try {
        const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [email]);
        if(checkResult.rows.length > 0) {
            res.redirect("/login");
        } else {
            bcrypt.hash(password, saltRounds, async (err, hash) => {
                if (err) {
                    console.log("Error hashing password: ", err);
                } else {
                    const result = await db.query("INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *", [email, hash]);
                    const user = result.rows[0];
                    req.login(user, (err) => {
                        console.log("success");
                        res.redirect("/login");
                    })
                }
            })
            
        }
    } catch (err) {
        console.log(err);
        res.redirect("register.ejs")
    }
})

// Submit the username and chosen room
// app.post("/submit", async (req, res) => {
//   if (req.isAuthenticated()) {
//     const room = req.body.room;
//     console.log(room);
//     try {
//       await db.query("UPDATE users SET username = $1 WHERE email = $2", [req.body.username, req.user.email]);
//       res.redirect("/chat");
//     } catch(err) {
//       console.log(err);
//     }
//   } else {
//     res.redirect("/")
//   }
// })

// google auth strategy (oauth)
passport.use("google",
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: "http://localhost:3000/auth/google/chatteroo",
            userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
        },
        async (accessToken, refreshToken, profile, cb) => {
            try {
                const result = await db.query("SELECT * FROM users WHERE email = $1", [
                  profile.email,
                ]);
                if (result.rows.length === 0) {
                  const newUser = await db.query(
                    "INSERT INTO users (email, password) VALUES ($1, $2)",
                    [profile.email, profile.id]
                  );
                  return cb(null, newUser.rows[0]);
                } else {
                  return cb(null, result.rows[0]);
                }
              } catch (err) {
                console.log(err);
            }
        }
    )
);

// Local authentication strategy (email & pass)
passport.use("local",
    new Strategy(async function verify(username, password, cb) {
      try {
        const result = await db.query("SELECT * FROM users WHERE email = $1 ", [
          username
        ]);
        if (result.rows.length > 0) {
          const user = result.rows[0];
          const storedHashedPassword = user.password;
          bcrypt.compare(password, storedHashedPassword, (err, valid) => {
            if (err) {
              console.error("Error comparing passwords:", err);
              return cb(err);
            } else {
              if (valid) {
                return cb(null, user);
              } else {
                return cb(null, false);
              }
            }
          });
        } else {
          return cb("User not found");
        }
      } catch (err) {
        console.log(err);
      }
    })
  );
  
passport.serializeUser((user, cb) => {
    cb(null, user);
});
  
passport.deserializeUser((user, cb) => {
   cb(null, user);
});
  
server.listen(port, () => console.log(`Server running on http://localhost:${port}`));