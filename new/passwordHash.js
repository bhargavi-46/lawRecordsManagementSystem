const bcrypt = require("bcrypt");
const mysql = require("mysql2/promise");

(async () => {
    try {
        const db = await mysql.createConnection({
            host: "name.mysql.database.azure.com",
            user: "adminsql",
            password: "project@123",
            database: "god", // Changed from lawrecords2 to lawrecords
            port: 3306,
            ssl: {
                rejectUnauthorized: true
            }
        });

        console.log("Connected to the database.");

        // Fetch users
        const [users] = await db.execute("SELECT user_id, password FROM users");

        for (let user of users) {
            // Log current password
            console.log(`User ${user.user_id} - Old Password: ${user.password}`);

            // Check if already hashed
            if (user.password.startsWith("$2b$")) {
                console.log(`User ${user.user_id} already has a hashed password. Skipping...`);
                continue;
            }

            // Hash the password
            const hashed = await bcrypt.hash(user.password, 10);
            console.log(`User ${user.user_id} - New Hashed Password: ${hashed}`);

            // Update DB
            await db.execute("UPDATE users SET password = ? WHERE user_id = ?", [hashed, user.user_id]);
            console.log(`User ${user.user_id} password updated.`);
        }

        console.log("Passwords updated successfully!");
        await db.end();
    } catch (error) {
        console.error("Error updating passwords:", error);
    }
})();
