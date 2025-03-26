const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });

const app = express();
app.use(cors());
app.use(bodyParser.json());

const dbConfig = {
    host: "name.mysql.database.azure.com",
    user: "adminsql",
    password: "project@123",
    database: "god",
    port: 3306,
    ssl: {
        rejectUnauthorized: true
    }
};

// Function to create database connection
const createDBConnection = async () => {
    try {
        const connection = await mysql.createConnection(dbConfig);
        console.log("Connected to MySQL database");
        return connection;
    } catch (error) {
        console.error("Database connection failed:", error);
        process.exit(1);  // Exit if DB connection fails
    }
};

// Generate case ID (format: CA + number)
const generateCaseId = async (db) => {
    const [result] = await db.execute("SELECT MAX(CAST(SUBSTRING(case_id, 3) AS UNSIGNED)) as max_id FROM cases");
    const maxId = result[0].max_id || 1000;
    return `CA${maxId + 1}`;
};

// Generate document ID (format: CD + number)
const generateDocumentId = async (db) => {
    const [result] = await db.execute("SELECT MAX(CAST(SUBSTRING(document_id, 3) AS UNSIGNED)) as max_id FROM case_documents");
    const maxId = result[0].max_id || 1000;
    return `CD${maxId + 1}`;
};

// Generate entry ID of the update(format: ED + number)
const generateEntryId = async (db) => {
    const [result] = await db.execute("SELECT MAX(CAST(SUBSTRING(entry_id, 3) AS UNSIGNED)) as max_id FROM case_updates");
    const maxId = result[0].max_id || 1000;
    return `ED${maxId + 1}`;
};


app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
    }
    const db = await createDBConnection();
    try {
        const [results] = await db.execute("SELECT * FROM users WHERE username = ?", [username]);

        if (results.length === 0) {
            return res.status(401).json({ error: "User not found" });
        }

        const user = results[0];
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({ error: "Invalid password" });
        }

        res.status(200).json({ message: "Login successful", user_id: user.user_id, role: user.role });

    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    } finally {
        db.end();
    }
});


// **Signup Route**
app.post("/signup", async (req, res) => {
    const {
        Fname, Lname, username, password, email,
        country_code, phone_no, street_no, street_name,
        building_name, city, state, pincode, role
    } = req.body;

    if (!Fname || !Lname || !username || !password || !email || !role) {
        return res.status(400).json({ message: "Required fields are missing" });
    }

    if (!["Lawyer", "Client"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
    }

    const db = await createDBConnection();

    try {
        // Check if email or username already exists
        const [existingUsers] = await db.execute(
            "SELECT email, username FROM users WHERE email = ? OR username = ?",
            [email, username]
        );
        if (existingUsers.length > 0) {
            return res.status(400).json({ message: "Email or username already exists" });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user into `users` table
        const [userResult] = await db.execute(
            `INSERT INTO users (Fname, Lname, username, password, email, 
                country_code, phone_no, street_no, street_name, building_name, 
                city, state, pincode, role) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [Fname, Lname, username, hashedPassword, email,
                country_code, phone_no, street_no, street_name,
                building_name, city, state, pincode, role]
        );

        // Get the newly created user's ID
        const userId = userResult.insertId;

        res.status(201).json({ message: "User registered, continue to next step", user_id: userId, role });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Database error" });
    } finally {
        db.end();
    }
});

// Signup - Step 2 for Lawyers
app.post("/signup/lawyer", async (req, res) => {
    // const user_id = req.headers.user_id;
    const {specialization, license_number} = req.body;
    console.log(specialization);

    // if(!user_id){
    //     return res.status(500).json({
    //         msg: "user_id is required"
    //     });
    // }
    if (!specialization || !license_number) {
        return res.status(400).json({ 
            msg: "All fields are required" 
        });
    }

    const db = await createDBConnection();

    try {
        const [lastUser] = await db.execute(
            "SELECT user_id, role FROM users ORDER BY user_id DESC LIMIT 1"
        );
        
        const user_id = lastUser[0].user_id;

        // Check if lawyer already exists with this user_id
        const [existingLawyer] = await db.execute(
            "SELECT lawyer_id FROM lawyers WHERE lawyer_id = ?",
            [user_id]
        );
        
        if (existingLawyer.length > 0) {
            return res.status(400).json({ message: "Lawyer profile already exists" });
        }

        // Check if user exists and has lawyer role
        const [userCheck] = await db.execute(
            "SELECT role FROM users WHERE user_id = ?",
            [user_id]
        );
        
        if (userCheck.length === 0) {
            return res.status(404).json({ 
                msg: "User not found" 
            });
        }
        
        if (userCheck[0].role !== "Lawyer") {
            return res.status(400).json({ 
                msg: "User is not registered as a lawyer" 
            });
        }

        await db.execute(
            `INSERT INTO lawyers (lawyer_id, specialization, license_number) 
             VALUES (?, ?, ?)`,
            [user_id, specialization, license_number]
        );

        res.status(201).json({ 
            msg: "Lawyer profile completed successfully!" 
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ 
            msg: "Database error" 
        });
    } finally {
        db.end();
    }
});

// Signup - Step 2 for Clients
app.post("/signup/client", async (req, res) => {
    // const user_id = req.headers.user_id;
    const {  
        identification_no,
        emergency_contact,
    } = req.body;


    // if(!user_id){
    //     return res.status(500).json({
    //         msg: "user_id is required"
    //     });
    // }
    if (!identification_no || !emergency_contact) {
        return res.status(400).json({ 
            msg: "All fields are required" 
        });
    }

    const db = await createDBConnection();


    try {
        const [lastUser] = await db.execute(
            "SELECT user_id, role FROM users ORDER BY user_id DESC LIMIT 1"
        );
        
        const user_id = lastUser[0].user_id;

        // Check if client already exists with this user_id
        const [existingClient] = await db.execute(
            "SELECT client_id FROM clients WHERE client_id = ?",
            [user_id]
        );
        
        if (existingClient.length > 0) {
            return res.status(400).json({ message: "Client profile already exists" });
        }

        // Check if user exists and has client role
        const [userCheck] = await db.execute(
            "SELECT role FROM users WHERE user_id = ?",
            [user_id]
        );
        
        if (userCheck.length === 0) {
            return res.status(404).json({ 
                msg: "User not found" 
            });
        }
        
        if (userCheck[0].role !== "Client") {
            return res.status(400).json({ 
                msg: "User is not registered as a client" 
            });
        }

        await db.execute(
            `INSERT INTO clients (client_id, identification_no, emergency_contact, total_cases_filed) 
             VALUES (?, ?, ?, 0)`,
            [user_id, identification_no,emergency_contact]
        );

        res.status(200).json({ 
            msg: "Client profile completed successfully!" 
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ 
            msg: "Database error" 
        });
    } finally {
        db.end();
    }
});

// Creating a new case // by the client
app.post("/cases", async function (req, res) {
    const { client_id, lawyer_id, case_number, case_type, title, description, status, court_name } = req.body;

    if (!client_id || !lawyer_id || !case_number || !case_type || !title || !status) {
        
        return res.status(400).json({ 
            msg: "Required fields are missing" 
        });
    }

    const db = await createDBConnection();

    try {

        const [ClientCheck] = await db.execute(
            "SELECT client_id FROM clients WHERE client_id = ?",
            [client_id]
        );
        
        if (ClientCheck.length === 0) {
            
        console.log("22222222222222222");
            return res.status(404).json({ 
                msg: "CLient doesn't exist" 
            });
        }

        const [LawyerCheck] = await db.execute(
            "SELECT lawyer_id FROM lawyers WHERE lawyer_id = ?",
            [lawyer_id]
        );
        
        if (LawyerCheck.length === 0) {
            
        console.log("33333333333333333");
            return res.status(404).json({ 
                msg: "Lawyer doesn't exist" 
            });
        }

        const case_id = await generateCaseId(db);

        console.log(status);
        await db.execute(
            `INSERT INTO cases (case_id, client_id, lawyer_id, case_number, case_type, title, description, status, court_name) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [case_id, client_id, lawyer_id, case_number, case_type, title, description, status, court_name]
        );

        // Create relationships in files and handles tables
        await db.execute(
            `INSERT INTO files (client_id, case_id) VALUES (?, ?)`,
            [client_id, case_id]
        );

        await db.execute(
            `INSERT INTO handles (lawyer_id, case_id) VALUES (?, ?)`,
            [lawyer_id, case_id]
        );

        // Update total_cases_filed for the client
        await db.execute(
            `UPDATE clients SET total_cases_filed = total_cases_filed + 1 WHERE client_id = ?`,
            [client_id]
        );

        res.status(200).json({ message: "Case created successfully!", case_id: case_id });

    } catch (err) {

        console.error(err);
        res.status(500).json({ message: "Database error" });
    } finally {
        db.end();
    }
});


//get lawyers of a specialization
app.get("/lawyers/:specialization", async function (req, res) {
    const specialization = req.params.specialization; // Extract specialization from URL parameters

    const db = await createDBConnection();

    try {
        // Fetch lawyers with the given specialization
        const [lawyersList] = await db.execute(
            "SELECT lawyer_id, Fname, Lname FROM lawyers JOIN users ON lawyers.lawyer_id = users.user_id WHERE specialization = ?",
            [specialization]
        );

        if (lawyersList.length === 0) {
            return res.status(404).json({ message: "No lawyers found for this specialization." });
        }

        res.json(lawyersList);
    } catch (err) {
        console.error("Error fetching lawyers:", err);
        res.status(500).json({ error: "Internal server error" });
    } finally {
        await db.end();
    }
});


// Get case by case_id
app.get("/cases/:id", async function (req, res) {
    const { id } = req.params;
    const db = await createDBConnection();

    try {
        const [caseResult] = await db.execute(
            "SELECT * FROM cases WHERE case_id = ?", 
            [id]
        );

        if (caseResult.length === 0) {
            return res.status(404).json({ message: "Case not found" });
        }

        res.status(200).json(caseResult[0]);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Database error" });
    } finally {
        db.end();
    }
});

// Add case updates
app.post("/cases/:id/update", async function (req, res) {
    const { id } = req.params;  // Case ID
    const { lawyer_id, update_date, task_description } = req.body;

    const db = await createDBConnection();

    try {

        const [CaseCheck] = await db.execute(
            "SELECT case_id FROM cases WHERE case_id = ?", 
            [id]
        );

        if (CaseCheck.length === 0) {
            return res.status(404).json({ message: "Case not found" });
        }

        const [LawyerCheck] = await db.execute(
            "SELECT lawyer_id FROM lawyers WHERE lawyer_id = ?", 
            [lawyer_id]
        );

        if (LawyerCheck.length === 0) {
            return res.status(404).json({ message: "Lawyer not found" });
        }

        const [LawyerCaseCheck] = await db.execute(
            "SELECT lawyer_id, case_id FROM handles WHERE lawyer_id = ? AND case_id = ?", 
            [lawyer_id, id]
        );

        if (LawyerCaseCheck.length === 0) {
            return res.status(404).json({ message: "Only Assigned Lawyer has access to giving updates" });
        }


        // Generate an entry_id
        const entry_id = await generateEntryId(db);

        await db.execute(`
            INSERT INTO case_updates (entry_id, case_id, lawyer_id, update_date, task_description) 
            VALUES (?, ?, ?, ?, ?)`,
            [entry_id, id, lawyer_id, update_date, task_description]
        );

        res.status(201).json({ message: "Case update added successfully", entry_id });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Database error" });
    } finally {
        db.end();
    }
});

// Get case updates of a certain client_id 
app.get("/clients/:id/updates", async function (req, res) {
    const { id } = req.params;  // Client ID
    const db = await createDBConnection();

    try {
        const [updates] = await db.execute(`
            SELECT cu.*, u.Fname AS LawyerFname, u.Lname AS LawyerLname, c.case_id, c.case_type, c.title AS case_title
            FROM case_updates cu
            JOIN cases c ON cu.case_id = c.case_id
            JOIN users u ON cu.lawyer_id = u.user_id
            WHERE c.client_id = ?
            ORDER BY cu.update_date DESC`,
            [id]
        );

        res.status(200).json(updates);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Database error" });
    } finally {
        db.end();
    }
});

// Get case updates of a certain lawyer_id
app.get("/lawyers/:id/updates", async function (req, res) {
    const { id } = req.params;  // Lawyer ID
    const db = await createDBConnection();

    try {
        const [updates] = await db.execute(`
            SELECT cu.*, u.Fname AS ClientFname, u.Lname AS ClientLname, c.case_id, 
            c.case_type, 
            c.title AS case_title
            FROM case_updates cu
            JOIN cases c ON cu.case_id = c.case_id
            JOIN clients cl ON c.client_id = cl.client_id
            JOIN users u ON cl.client_id = u.user_id
            WHERE c.lawyer_id = ?
            ORDER BY cu.update_date DESC`,
            [id]
        );

        res.status(200).json(updates);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Database error" });
    } finally {
        db.end();
    }
});


// Upload case document for a case Id
app.post("/cases/:id/document", upload.single('document'), async function (req, res) {
    const { id } = req.params;  // Case ID
    const {document_type, status, description, lawyer_id } = req.body;

    const db = await createDBConnection();

    const [userCheck] = await db.execute(
        "SELECT lawyer_id, case_id FROM handles WHERE lawyer_id = ? AND case_id = ?",
        [lawyer_id, id]
    );
        
    if (userCheck.length===0) {
        return res.status(400).json({ 
            msg: "Only Assigned Lawyers can upload documents" 
        });
    }


    const validDocumentType = ["Legal Document", "Evidence", "Discovery", "Witness Statement"];
    if (!validDocumentType.includes(document_type)) {
        return res.status(400).json({ message: "Invalid document type" });
    }

    const validStatuses = ["Draft", "Final", "Revoked"];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status of the document" });
    }

    try {
        const [CaseCheck] = await db.execute(
            "SELECT case_id FROM cases WHERE case_id = ?", 
            [id]
        );

        if (CaseCheck.length === 0) {
            return res.status(404).json({ message: "Case not found" });
        }

        // Generate a document_id
        const document_id = await generateDocumentId(db);
        const filePath = `https://drive.google.com/${id}/${document_id}`;

        await db.execute(`
            INSERT INTO case_documents (document_id, case_id, document_type, status, file_path, description, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [document_id, id, document_type, status, filePath, description]
        );

        res.status(201).json({ 
            message: "Document uploaded successfully", 
            document_id,
            file_path: filePath
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Database error" });
    } finally {
        db.end();
    }
});

// Get case documents FOR A SPECIFIC CLIENT_ID
app.get("/clients/:client_id/documents", async function (req, res) {
    const { client_id } = req.params; // Client ID
    const db = await createDBConnection();

    try {
        const [documents] = await db.execute(`
            SELECT cd.*, c.title AS case_title
            FROM case_documents cd
            JOIN cases c ON cd.case_id = c.case_id
            WHERE c.client_id = ?
            ORDER BY cd.created_at DESC`,
            [client_id]
        );

        res.status(200).json(documents);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Database error" });
    } finally {
        db.end();
    }
});


// Get cases for a specific client
app.get("/client/:id/cases", async function (req, res) {
    const { id } = req.params;  // Client ID
    const db = await createDBConnection();

    try {
        const [ClientCheck] = await db.execute(
            "SELECT client_id FROM clients WHERE client_id = ?", 
            [id]
        );

        if (ClientCheck.length === 0) {
            return res.status(404).json({ message: "Client not found" });
        }

        const [cases] = await db.execute(`
            SELECT c.*, u.Fname, u.Lname
            FROM cases c
            JOIN users u ON c.lawyer_id = u.user_id
            WHERE c.client_id = ?
            ORDER BY c.created_at DESC`,
            [id]
        );

        res.status(200).json(cases);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Database error" });
    } finally {
        db.end();
    }
});

// Get cases for a specific lawyer
app.get("/lawyer/:id/cases", async function (req, res) {
    const { id } = req.params;  // Lawyer ID
    const db = await createDBConnection();

    try {

        const [LawyerCheck] = await db.execute(
            "SELECT lawyer_id FROM lawyers WHERE lawyer_id = ?", 
            [id]
        );

        if (LawyerCheck.length === 0) {
            return res.status(404).json({ message: "Lawyer not found" });
        }

        const [cases] = await db.execute(`
            SELECT c.*, u.Fname, u.Lname
            FROM cases c
            JOIN users u ON c.client_id = u.user_id
            WHERE c.lawyer_id = ?
            ORDER BY c.created_at DESC`,
            [id]
        );

        res.status(200).json(cases);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Database error" });
    } finally {
        db.end();
    }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = app;