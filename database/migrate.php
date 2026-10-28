<?php
declare(strict_types=1);

/**
 * Migration + seed runner (CLI only).
 *   php database/migrate.php             run pending migrations
 *   php database/migrate.php --seed      also run seed files (database/seeds/*.php, in order)
 *   php database/migrate.php --fresh     DROP ALL TABLES in the configured database first (APP_ENV=local only)
 *   php database/migrate.php --status    list applied / pending migrations
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../backend/config/config.php';
require_once __DIR__ . '/../backend/core/response.php';
require_once __DIR__ . '/../backend/core/db.php';
load_env();
date_default_timezone_set('Asia/Kolkata');

$args = array_slice($argv, 1);
$fresh  = in_array('--fresh', $args, true);
$seed   = in_array('--seed', $args, true);
$status = in_array('--status', $args, true);

$pdo = db();
$db_name = (string) config('db.name');

if ($fresh) {
    if (config('app.env') !== 'local') {
        fwrite(STDERR, "Refusing --fresh: APP_ENV is not 'local'.\n");
        exit(1);
    }
    echo "Dropping all tables in `{$db_name}` ...\n";
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    foreach ($pdo->query('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"')->fetchAll(PDO::FETCH_NUM) as $row) {
        $pdo->exec('DROP TABLE `' . str_replace('`', '', $row[0]) . '`');
    }
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
}

$pdo->exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   VARCHAR(190) NOT NULL PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
);

$applied = array_column($pdo->query('SELECT filename FROM schema_migrations')->fetchAll(), 'filename');
$files = glob(__DIR__ . '/migrations/*.sql') ?: [];
sort($files);

if ($status) {
    foreach ($files as $f) {
        $name = basename($f);
        echo (in_array($name, $applied, true) ? '[applied] ' : '[pending] ') . $name . "\n";
    }
    exit(0);
}

/** Split a SQL file into statements (migration files contain no semicolons inside strings). */
function split_sql(string $sql): array
{
    $lines = array_filter(
        preg_split('/\R/', $sql),
        fn (string $l): bool => !str_starts_with(ltrim($l), '--')
    );
    $parts = explode(';', implode("\n", $lines));
    return array_values(array_filter(array_map('trim', $parts), fn (string $s): bool => $s !== ''));
}

$ran = 0;
foreach ($files as $f) {
    $name = basename($f);
    if (in_array($name, $applied, true)) {
        continue;
    }
    echo "Applying {$name} ... ";
    try {
        // DDL auto-commits in MySQL, so no wrapping transaction; each file is applied statement by statement.
        foreach (split_sql((string) file_get_contents($f)) as $statement) {
            $pdo->exec($statement);
        }
        $pdo->prepare('INSERT INTO schema_migrations (filename) VALUES (?)')->execute([$name]);
        echo "ok\n";
        $ran++;
    } catch (Throwable $e) {
        echo "FAILED\n" . $e->getMessage() . "\n";
        exit(1);
    }
}
echo $ran === 0 ? "Nothing to migrate.\n" : "Applied {$ran} migration(s).\n";

if ($seed) {
    $seeds = glob(__DIR__ . '/seeds/*.php') ?: [];
    sort($seeds);
    foreach ($seeds as $s) {
        echo 'Seeding ' . basename($s) . ' ... ';
        require $s;
        echo "ok\n";
    }
}
