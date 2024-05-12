import express from "express";
import cors from "cors";
import pg from "pg";
import bcrypt from "bcrypt";
import { config } from "dotenv";
config();
const port = process.env.PORT || 3000;

const { Pool } = pg;

const app = express();
app.use(cors());
app.use(express.json());

// Create a PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

// Test the database connection
// pool.connect((err) => {
//   if (err) {
//     console.error("Error connecting to the database", err);
//   } else {
//     console.log("Connected to the database");
//   }
// });

//created table 'animes' as:
// CREATE TABLE animes (
//   anime_id SERIAL PRIMARY KEY,
//   mal_id INTEGER NOT NULL,
//   title varchar(255) NOT NULL,
//   title_english varchar(255),
//   image_url varchar(255) NOT NULL,
//   watched_episodes INTEGER NOT NULL,
//   total_episodes varchar(255) NOT NULL
// );
//created table 'users' as:
// CREATE TABLE users (
//     user_id SERIAL PRIMARY KEY,
//     username VARCHAR(50) UNIQUE NOT NULL,
//     password VARCHAR(100) NOT NULL,
// );
// created table 'user_animes' as:
// CREATE TABLE user_animes (
//     user_id INT REFERENCES users(user_id),
//     anime_id INT REFERENCES animes(anime_id),
//     PRIMARY KEY (user_id, anime_id)
// );

//Routes for users
//signup user
app.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  try {
    //check if username already exists
    const existingUser = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: "Username already exists" });
    }
    //hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    //insert new user
    await pool.query("INSERT INTO users (username, password) VALUES($1,$2)", [
      username,
      hashedPassword,
    ]);
    res.status(201).json({ message: "User created successfully" });
  } catch (err) {
    console.error("SignUp error:", err);
    res.status(500).json({ message: "An error occurred during signup" });
  }
});

//login user
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await pool.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);
    if (user.rows.length === 0) {
      return res.status(401).json({ message: "Invalid username or password" });
    }
    //verify the password with bcrypt
    const isValidPassword = await bcrypt.compare(
      password,
      user.rows[0].password
    );
    if (!isValidPassword) {
      return res.status(401).json({ message: "Invalid username or password" });
    }
    //get user_id so that i can send it to frontend
    const user_id = user.rows[0].user_id;
    //get all animes for the user
    const userAnimes = await pool.query(
      "SELECT animes.* FROM animes INNER JOIN user_animes ON animes.anime_id = user_animes.anime_id WHERE user_animes.user_id = $1",
      [user.rows[0].user_id]
    );
    //return the token and user's animes in the response
    res.status(200).json({ user_id, userAnimes: userAnimes.rows });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "An error occurred during login" });
  }
});

//Routes for animes
//add an anime for a user
app.post("/users/:userId/animes", async (req, res) => {
  const { userId } = req.params;
  const {
    mal_id,
    title,
    title_english,
    image_url,
    watched_episodes,
    total_episodes,
  } = req.body;

  try {
    // Start a transaction
    await pool.query("BEGIN");

    // Step 1: Insert the newAnime into the 'animes' table
    const newAnime = await pool.query(
      "INSERT INTO animes (mal_id, title, title_english, image_url, watched_episodes, total_episodes) VALUES($1,$2,$3,$4,$5,$6) RETURNING anime_id",
      [
        mal_id,
        title,
        title_english,
        image_url,
        watched_episodes,
        total_episodes,
      ]
    );
    const animeId = newAnime.rows[0].anime_id;

    // Step 2: Insert the association into the 'user_animes' table
    await pool.query(
      "INSERT INTO user_animes (user_id, anime_id) VALUES ($1, $2)",
      [userId, animeId]
    );

    // Commit the transaction
    await pool.query("COMMIT");

    //send animeId to frontend
    res.status(201).json({ animeId, message: "Anime added successfully" });
  } catch (err) {
    // Rollback the transaction if an error occurs
    await pool.query("ROLLBACK");
    console.error("Error adding anime:", err);
    res.status(500).json({ error: "An error occurred while adding anime." });
  }
});
//update an anime for a user
app.put("/users/:userId/animes/:animeId", async (req, res) => {
  const { userId, animeId } = req.params;
  const { watched_episodes } = req.body;
  try {
    //update the watched_episodes field in animes table
    await pool.query(
      "UPDATE animes SET watched_episodes = $1 FROM user_animes WHERE animes.anime_id = user_animes.anime_id AND user_animes.user_id = $2 AND user_animes.anime_id = $3",
      [watched_episodes, userId, animeId]
    );
    res.status(200).json({ message: "Anime updated successfully" });
  } catch (err) {
    console.error("Error updating anime:", err);
    res.status(500).json({ error: "An error occurred while updating anime." });
  }
});
//delete an anime for a user
app.delete("/users/:userId/animes/:animeId", async (req, res) => {
  const { userId, animeId } = req.params;
  try {
    //delete association between user and anime from user_animes table
    await pool.query(
      "DELETE FROM user_animes WHERE user_id=$1 AND anime_id=$2",
      [userId, animeId]
    );
    //delete anime from animes table
    await pool.query("DELETE FROM animes WHERE anime_id = $1", [animeId]);
    res.status(200).json({ message: "Anime deleted successfully" });
  } catch (err) {
    console.error("Error deleting anime:", err);
    res.status(500).json({ error: "An error occurred while deleting anime." });
  }
});

app.listen(port, () => {
  console.log("server is running on render");
});
