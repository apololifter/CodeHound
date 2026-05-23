<?php
function process_data() {
    echo "Processing data in PHP...\n";
    // Imagine this php script calls a JS script
    exec("node helper.js");
}

process_data();
?>
