import os
import psycopg2

DATABASE_URL = os.getenv("DATABASE_URL", "")

def fix_url(url):
    url = url.strip().strip('"').strip("'")
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    return url

def main():
    url = fix_url(DATABASE_URL)
    conn = psycopg2.connect(url, sslmode="require")
    cur = conn.cursor()

    # У KostiantynWalmond 1 победа, рейтинг должен быть 10 а не 1010
    # Значит стартовый был 1000, вычитаем 1000
    cur.execute("UPDATE users SET elo_rating = elo_rating - 1000 WHERE elo_rating >= 1000")
    fixed = cur.rowcount
    conn.commit()
    print("Fixed " + str(fixed) + " users")

    cur.execute("SELECT id, username, elo_rating, wins, losses FROM users ORDER BY elo_rating DESC LIMIT 20")
    rows = cur.fetchall()
    print("After fix:")
    for row in rows:
        print("  id=" + str(row[0]) + " name=" + str(row[1]) + " rating=" + str(row[2]) + " wins=" + str(row[3]) + " losses=" + str(row[4]))

    cur.close()
    conn.close()
    print("Done!")

main()