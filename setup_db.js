const connection = require("./db/db.js");

const alterQueries = [
  "ALTER TABLE programs ADD COLUMN mode VARCHAR(100) DEFAULT 'Offline / Online'",
  "ALTER TABLE programs ADD COLUMN duration VARCHAR(100) DEFAULT '3 Months'",
  "ALTER TABLE programs ADD COLUMN hours VARCHAR(100) DEFAULT '4 Hours Per Week'",
  "ALTER TABLE programs ADD COLUMN location VARCHAR(100) DEFAULT 'Bangalore'"
];

function runQueriesSequentially(queries, callback) {
  if (queries.length === 0) return callback();
  const query = queries.shift();
  connection.query(query, (err) => {
    // If column already exists, ignore the error
    if (err && !err.message.includes("Duplicate column name")) {
      console.error(`Error executing: ${query}\n`, err.message);
    } else {
      console.log(`Executed query: ${query}`);
    }
    runQueriesSequentially(queries, callback);
  });
}

const defaultPrograms = [
  {
    program_name: "Education Support",
    description: "Help students improve learning skills, reading abilities, and academic performance. Make a meaningful impact in the lives of children.",
    requirements: "Age 18+, Good Communication Skills, Passion For Teaching, Positive Attitude",
    responsibilities: "Assist Students, Conduct Learning Sessions, Support Educational Activities, Track Student Progress",
    benefits: "Volunteer Certificate, Experience Letter, Leadership Skills, Networking Opportunities",
    mode: "Offline / Online",
    duration: "3 Months",
    hours: "4 Hours Per Week",
    location: "Bangalore"
  },
  {
    program_name: "Environment Campaigns",
    description: "Participate in tree plantation drives and sustainability programs. Protect our environment and help build a greener future.",
    requirements: "Age 16+, Physical Fitness, Love for Nature, Teamwork Skills",
    responsibilities: "Plant Trees, Conduct Clean-up Drives, Educate on Sustainability, Manage Recycle Campaigns",
    benefits: "Certificate of Participation, Green Ambassador Badge, Environmental Awareness, Team Building",
    mode: "Offline",
    duration: "1 Month",
    hours: "6 Hours Per Week",
    location: "Bangalore"
  },
  {
    program_name: "Community Service",
    description: "Support community welfare and outreach initiatives. Help distribute food, organize events, and support local shelters.",
    requirements: "Age 18+, Empathy and Kindness, Willingness to help, Good communication",
    responsibilities: "Assist in Food Drives, Support Local Shelters, Organize Community Events, Help Vulnerable People",
    benefits: "Certificate of Service, Social Contribution, Community Connection, Leadership Skills",
    mode: "Offline / Online",
    duration: "2 Months",
    hours: "5 Hours Per Week",
    location: "Bangalore"
  }
];

runQueriesSequentially([...alterQueries], () => {
  connection.query("SELECT COUNT(*) as count FROM programs", (err, results) => {
    if (err) {
      console.error("Error counting programs:", err);
      process.exit(1);
    }
    
    if (results[0].count === 0) {
      console.log("Seeding default programs...");
      let completed = 0;
      defaultPrograms.forEach(p => {
        const sql = "INSERT INTO programs (program_name, description, requirements, responsibilities, benefits, mode, duration, hours, location) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
        connection.query(
          sql,
          [p.program_name, p.description, p.requirements, p.responsibilities, p.benefits, p.mode, p.duration, p.hours, p.location],
          (err) => {
            if (err) {
              console.error(`Error inserting ${p.program_name}:`, err);
            } else {
              console.log(`Inserted ${p.program_name}`);
            }
            completed++;
            if (completed === defaultPrograms.length) {
              console.log("Database Setup Completed Successfully.");
              process.exit(0);
            }
          }
        );
      });
    } else {
      console.log("Programs table already has data. Skipping seed.");
      process.exit(0);
    }
  });
});
