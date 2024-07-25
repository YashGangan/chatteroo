/* @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./views/**/*.ejs", // Scans all .ejs files in views and subdirectories
    "./views/**/*.js",  // Scans all .js files if you have inline scripts
    "./public/**/*.js", // Scans JavaScript files in public if necessary
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
