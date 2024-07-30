import express from "express";
import bodyParser from "body-parser";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth2";
import session from "express-session";
import { createClient } from "@supabase/supabase-js";
import env from "dotenv";
import { generateFromEmail } from "unique-username-generator";
import * as http from 'node:http';
import { Server } from "socket.io";
import formatMessage from '../utils/messages.js';
import { userJoin, getCurrentUser, userLeave, getRoomUsers } from '../utils/users.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

env.config();

const app = express();
const port = process.env.PORT || 3000;
const botName = "ChatterooBot";

// Socket connections
const server = http.createServer(app);
const io = new Server(server);

// Starts when client connects
io.on('connection', socket => {
  // Join Room
  socket.on('joinRoom', ({ username, room }) => {
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
  });

  // Listen for chat message
  socket.on('chatMessage', (msg) => {
    const user = getCurrentUser(socket.id);
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
  });
});

// Supabase client setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);
const saltRounds = 10;

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
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

app.get("/", (req, res) => {
  res.render('index.ejs');
});

app.get("/register", (req, res) => {
  res.render('register.ejs');
});

app.get("/login", (req, res) => {
  res.render('login.ejs');
});

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
      const { data, error } = await supabase
        .from('users')
        .select('username')
        .eq('email', req.user.email);

      if (error) throw error;

      let newName = data[0]?.username || generateFromEmail(req.user.email, 3);
      res.render("home.ejs", { username: newName });
    } catch (err) {
      console.log(err);
    }
  } else {
    res.redirect("/logout");
  }
});

app.get("/chat", async (req, res) => {
  if (req.isAuthenticated()) {
    const currUser = req.body.username;
    const room = req.body.room;
    try {
      const { data, error } = await supabase
        .from('users')
        .update({ username: currUser })
        .eq('email', req.user.email);

      if (error) throw error;

      res.render("chat.ejs", { username: currUser, room: room });
    } catch (err) {
      console.log(err);
    }
  } else {
    res.redirect("/logout");
  }
});

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
  let password = req.body.password === req.body.confirmPassword ? req.body.password : '';
  if (!password) return res.render("register.ejs");

  try {
    const { data: existingUser, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email);

    if (existingUser.length > 0) {
      res.redirect("/login");
    } else {
      bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
          console.log("Error hashing password: ", err);
        } else {
          const { data, error } = await supabase
            .from('users')
            .insert([{ email, password: hash }])
            .single();

          if (error) throw error;

          const user = data;
          req.login(user, (err) => {
            if (err) {
              console.log("Error logging in user: ", err);
            } else {
              console.log("success");
              res.redirect("/login");
            }
          });
        }
      });
    }
  } catch (err) {
    console.log(err);
    res.redirect("register.ejs");
  }
});

// Google auth strategy (OAuth)
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
        const { data: user, error } = await supabase
          .from('users')
          .select('*')
          .eq('email', profile.email)
          .single();

        if (!user) {
          const { data: newUser, error } = await supabase
            .from('users')
            .insert({ email: profile.email, password: profile.id })
            .single();

          if (error) throw error;

          return cb(null, newUser);
        } else {
          return cb(null, user);
        }
      } catch (err) {
        console.log(err);
      }
    }
  )
);

// Local authentication strategy (email & password)
passport.use("local",
  new LocalStrategy(async function verify(username, password, cb) {
    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', username)
        .single();

      if (error) throw error;

      if (user) {
        bcrypt.compare(password, user.password, (err, valid) => {
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
  // Store the user's unique ID in the session
  cb(null, user.id);
});

passport.deserializeUser(async (id, cb) => {
    try {
      // Fetch the user details from Supabase using the user ID
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single();
  
      if (error) throw error;
  
      // Pass the user data to the callback function
      cb(null, data);
    } catch (err) {
      cb(err, null);
    }
  });

// server.listen(port, () => console.log(`Server running on http://localhost:${port}`));

const handleRequest = (req, res) => {
  if (!res.socket.server) {
    console.log('Server is initializing');
    res.socket.server = server;
    server.listen();
  }
  server.emit('request', req, res);
};

export default handleRequest;