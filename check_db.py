import sqlite3
c = sqlite3.connect('database.db')
rows = c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
print("Tables:", rows)
r = c.execute("PRAGMA table_info(quick_shares)").fetchall()
print("quick_shares columns:", r)
c.close()
