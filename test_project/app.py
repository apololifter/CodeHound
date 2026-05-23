import subprocess
import os

def main():
    print("Running PHP script...")
    subprocess.run(["php", "script.php"])
    
if __name__ == "__main__":
    main()
@app.post('/api/user')
def get_user():
    pass  
 