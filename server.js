require("dotenv").config();

const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const session = require("express-session");

const app = express();

const db = require("./db/db");

db.query(
  `CREATE TABLE IF NOT EXISTS contact_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    volunteer_id INT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NULL,
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'New',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  (err) => {
    if (err) {
      console.error("Contact messages table setup failed:", err.message);
    }
  }
);

/* Middleware */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

app.use(
  session({
    secret: "volunteer_system_secret_key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax"
    }
  })
);

/* ==========================
AUTHENTICATION MIDDLEWARE
========================== */
const checkUserAuth = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.redirect("/login");
  }
};

const checkUserApiAuth = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.status(401).json({ success: false, message: "Please log in first." });
  }
};

/* ==========================
HOME PAGE
========================= */

app.get("/", checkUserAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

/* ==========================
REGISTER PAGE
========================== */

app.get("/register", (req, res) => {
  if (req.session.user) {
    return res.redirect("/");
  }
  res.sendFile(path.join(__dirname, "views", "register.html"));
});

/* ==========================
LOGIN PAGE
========================== */

app.get("/login", (req, res) => {
  if (req.session.user) {
    return res.redirect("/");
  }
  res.sendFile(path.join(__dirname, "views", "login.html"));
});

/* ==========================
PROGRAM PAGE
========================== */

app.get("/program", checkUserAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "program.html"));
});

app.get("/profile", checkUserAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "profile.html"));
});

/* ==========================
ADMIN PAGE & LOGIN FLOW
========================== */

app.get("/admin", (req, res) => {
  if (req.session.isAdmin) {
    return res.redirect("/admin/dashboard");
  }
  res.sendFile(path.join(__dirname, "views", "admin-login.html"));
});

app.post("/admin-login", (req, res) => {
  const { username, password } = req.body;

  if (username === "admin" && password === "admin123") {
    req.session.isAdmin = true;
    res.redirect("/admin/dashboard");
  } else {
    res.send(`
      <script>
        alert("Invalid Admin Credentials");
        window.location.href = "/admin";
      </script>
    `);
  }
});

const checkAdminPageAuth = (req, res, next) => {
  if (req.session.isAdmin) {
    next();
  } else {
    res.redirect("/admin");
  }
};

app.get("/admin/dashboard", checkAdminPageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "admin-dashboard.html"));
});

app.get("/admin/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/admin");
});

app.get("/success", checkUserAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "success.html"));
});

/* ==========================
REGISTER USER
========================== */

app.post("/register", async (req, res) => {
  if (req.session.user) {
    return res.redirect("/");
  }

  try {
    const { name, email, phone, city, skills, password, program_name } = req.body;

    console.log("Form Data:", req.body);

    const hashedPassword = await bcrypt.hash(password, 10);

    const applicationStatus = program_name ? "Pending" : "Registered";

    const sql =
      "INSERT INTO volunteers (name, email, phone, city, skills, password, program_name, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

    db.query(
      sql,
      [name, email, phone, city, skills, hashedPassword, program_name || null, applicationStatus],
      (err, result) => {
        if (err) {
          console.log("MYSQL ERROR:");
          console.log(err);

          return res.send("Registration Failed: " + err.message);
        }

        res.redirect("/login?registered=1");
      }
    );
  } catch (error) {
    console.log("SERVER ERROR:");
    console.log(error);

    res.send("Server Error: " + error.message);
  }
});

/* ==========================
LOGIN USER
========================== */

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  const sql = "SELECT * FROM volunteers WHERE email = ?";

  db.query(sql, [email], async (err, results) => {
    if (err) {
      console.log(err);
      return res.send("Database Error");
    }

    if (results.length === 0) {
      return res.send("User Not Found");
    }

    const user = results[0];

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.send("Invalid Password");
    }

    // Set session
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email
    };

    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.send("Session Error");
      }
      const redirectUrl = req.query.redirect || "/";
      res.redirect(redirectUrl);
    });
  });
});

app.get("/api/auth/me", (req, res) => {
  if (req.session.user) {
    db.query("SELECT id, name, email, phone, city, skills, program_name, status, created_at FROM volunteers WHERE id = ?", [req.session.user.id], (err, results) => {
      if (err || results.length === 0) {
        return res.json({ loggedIn: false });
      }
      res.json({ loggedIn: true, user: results[0] });
    });
  } else {
    res.json({ loggedIn: false });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

/* ==========================
CONTACT API
========================== */

app.post("/api/contact", checkUserApiAuth, (req, res) => {
  const { name, email, phone, subject, message } = req.body;

  if (!subject || !message) {
    return res.status(400).json({ success: false, message: "Subject and message are required." });
  }

  db.query(
    "SELECT name, email, phone FROM volunteers WHERE id = ?",
    [req.session.user.id],
    (err, results) => {
      if (err || results.length === 0) {
        return res.status(500).json({ success: false, message: "Unable to load your account details." });
      }

      const user = results[0];
      const sql =
        "INSERT INTO contact_messages (volunteer_id, name, email, phone, subject, message, status) VALUES (?, ?, ?, ?, ?, ?, 'New')";

      db.query(
        sql,
        [
          req.session.user.id,
          name || user.name,
          email || user.email,
          phone || user.phone || null,
          subject,
          message
        ],
        (insertErr) => {
          if (insertErr) {
            console.error(insertErr);
            return res.status(500).json({ success: false, message: "Could not send your message." });
          }

          res.json({ success: true, message: "Your message was sent to the admin team." });
        }
      );
    }
  );
});

app.post("/api/volunteer/apply", checkUserApiAuth, (req, res) => {
  const { program_name } = req.body;
  const userId = req.session.user.id;

  if (!program_name) {
    return res.status(400).json({ success: false, message: "Program name is required" });
  }

  const sql = "UPDATE volunteers SET program_name = ?, status = 'Pending' WHERE id = ?";
  db.query(sql, [program_name, userId], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: "Database error" });
    }
    res.json({ success: true, message: "Application submitted successfully" });
  });
});

/* ==========================
PROGRAMS API
========================== */

app.get("/api/program", checkUserApiAuth, (req, res) => {
  const programName = req.query.name;
  if (!programName) {
    return res.status(400).json({ success: false, message: "Program name is required" });
  }

  const sql = "SELECT * FROM programs WHERE program_name = ?";
  db.query(sql, [programName], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: "Database error" });
    }
    if (results.length === 0) {
      return res.status(404).json({ success: false, message: "Program not found" });
    }
    res.json({ success: true, program: results[0] });
  });
});

/* ==========================
ADMIN APIS (PROTECTED)
========================== */

const checkAdminAuth = (req, res, next) => {
  if (req.session.isAdmin) {
    next();
  } else {
    res.status(401).json({ success: false, message: "Unauthorized" });
  }
};

app.get("/api/admin/stats", checkAdminAuth, (req, res) => {
  const stats = {};

  // Total volunteers
  db.query("SELECT COUNT(*) as total FROM volunteers", (err, results1) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    stats.totalVolunteers = results1[0].total;

    // Pending applications
    db.query("SELECT COUNT(*) as pending FROM volunteers WHERE status = 'Pending' AND program_name IS NOT NULL", (err, results2) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      stats.pendingApplications = results2[0].pending;

      // Unique cities
      db.query("SELECT COUNT(DISTINCT city) as cities FROM volunteers", (err, results3) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        stats.citiesCovered = results3[0].cities;

        // Volunteers who selected or applied to a program
        db.query("SELECT COUNT(*) as programs FROM volunteers WHERE program_name IS NOT NULL", (err, results4) => {
          if (err) return res.status(500).json({ success: false, message: err.message });
          stats.programsJoined = results4[0].programs;

          db.query("SELECT COUNT(*) as contactMessages FROM contact_messages WHERE status = 'New'", (err, results5) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            stats.contactMessages = results5[0].contactMessages;

            res.json({ success: true, stats });
          });
        });
      });
    });
  });
});

app.get("/api/admin/volunteers", checkAdminAuth, (req, res) => {
  db.query("SELECT id, name, email, phone, city, skills, program_name, status, created_at FROM volunteers ORDER BY id DESC", (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: "Database error" });
    }
    res.json({ success: true, volunteers: results });
  });
});

app.post("/api/admin/volunteers/status", checkAdminAuth, (req, res) => {
  const { id, status } = req.body;
  if (!id || !status) {
    return res.status(400).json({ success: false, message: "ID and status are required" });
  }

  const sql = "UPDATE volunteers SET status = ? WHERE id = ?";
  db.query(sql, [status, id], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: "Database error" });
    }
    res.json({ success: true, message: `Volunteer status updated to ${status}` });
  });
});

app.post("/api/admin/volunteers/delete", checkAdminAuth, (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ success: false, message: "ID is required" });
  }

  const sql = "DELETE FROM volunteers WHERE id = ?";
  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: "Database error" });
    }
    res.json({ success: true, message: "Volunteer deleted successfully" });
  });
});

app.get("/api/admin/programs", checkAdminAuth, (req, res) => {
  db.query("SELECT * FROM programs ORDER BY program_name ASC", (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: "Database error" });
    }
    res.json({ success: true, programs: results });
  });
});

app.get("/api/admin/contact-messages", checkAdminAuth, (req, res) => {
  db.query(
    "SELECT id, volunteer_id, name, email, phone, subject, message, status, created_at FROM contact_messages ORDER BY id DESC",
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "Database error" });
      }
      res.json({ success: true, messages: results });
    }
  );
});

app.post("/api/admin/contact-messages/status", checkAdminAuth, (req, res) => {
  const { id, status } = req.body;

  if (!id || !status) {
    return res.status(400).json({ success: false, message: "ID and status are required" });
  }

  const sql = "UPDATE contact_messages SET status = ? WHERE id = ?";
  db.query(sql, [status, id], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: "Database error" });
    }
    res.json({ success: true, message: `Contact message marked as ${status}` });
  });
});

app.get("/api/admin/contact-messages/report", checkAdminAuth, (req, res) => {
  db.query(
    "SELECT id, name, email, phone, subject, message, status, created_at FROM contact_messages ORDER BY id DESC",
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Database error");
      }

      const escapeCsv = (value) => {
        const text = value === null || value === undefined ? "" : String(value);
        return `"${text.replace(/"/g, '""')}"`;
      };

      const rows = [
        ["ID", "Name", "Email", "Phone", "Subject", "Message", "Status", "Submitted At"],
        ...results.map((row) => [
          row.id,
          row.name,
          row.email,
          row.phone,
          row.subject,
          row.message,
          row.status,
          row.created_at
        ])
      ];

      const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=contact-messages-report.csv");
      res.send(csv);
    }
  );
});

app.post("/api/admin/programs/update", checkAdminAuth, (req, res) => {
  const { id, description, requirements, responsibilities, benefits, mode, duration, hours, location } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, message: "Program ID is required" });
  }

  const sql = `
    UPDATE programs 
    SET description = ?, requirements = ?, responsibilities = ?, benefits = ?, mode = ?, duration = ?, hours = ?, location = ?
    WHERE id = ?
  `;

  db.query(
    sql,
    [description, requirements, responsibilities, benefits, mode, duration, hours, location, id],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "Database error" });
      }
      res.json({ success: true, message: "Program updated successfully" });
    }
  );
});

/* ==========================
START SERVER
========================== */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
