<?php
/**
 * Define your username/password in $VALID_USERNAME and $VALID_PASSWORD_HASH, and then include() this 
 * script before your PHP code has returned any headers or output.
 *
 * Save the password as the output of `password_hash()` to avoid leaving plaintext passwords in your
 * code, as we've done for the demonstration values below
 * Recommend using single quotes, as they contain $ chars that trigger variable interpolation
 ******************************************************************************/

if (!isset($VALID_USERNAME)) { $VALID_USERNAME = 'demo'; }
if (!isset($VALID_PASSWORD_HASH)) { $VALID_PASSWORD_HASH = password_hash('demo', PASSWORD_BCRYPT); }

/******************************************************************************/

if (isset($_POST['submit_auth'])) {
  $uname = isset($_POST['uname']) ? $_POST['uname'] : '';
  $passwd = isset($_POST['passwd']) ? $_POST['passwd'] : '';
} else {
  $uname = isset($_COOKIE['uname']) ? $_COOKIE['uname'] : '';
  $passwd = isset($_COOKIE['passwd']) ? $_COOKIE['passwd'] : '';
}

if ($uname != $VALID_USERNAME || !password_verify($passwd, $VALID_PASSWORD_HASH)) {
  $error = isset($_POST['submit_auth']) ? "Invalid username and/or password" : "Authorization required";
  show_login_form($error);
  exit();     
}
if (isset($_POST['submit_auth'])) {
  setcookie("uname", $uname, time() + 24 * 3600);
  setcookie("passwd", $passwd, time() + 24 * 3600);
}
   
function show_login_form($error="Authorization required") {
?>
<!DOCTYPE html>
<html>
<head>
  <title>Authentication required</title>
  <link href="css/style.css" rel="stylesheet" />
  <link href="css/simple-auth.css" rel="stylesheet" />
  
  <?php includeAfterHead(); ?>
</head>
<body>
  <div class="log-form">
    <h2><?= htmlspecialchars($error) ?></h2>
    <form action="<?= htmlspecialchars($_SERVER['PHP_SELF']) ?>" method="post">
      <input class="text" name="uname" type="text" title="username" placeholder="username" />
      <input class="text" name="passwd" type="password" title="username" placeholder="password" />
      <input class="button styled-btn" type="submit" name="submit_auth" value="Login" />
    </form>
  </div>
  
  <?php includeAfterBody(); ?>
</body>       

<?php   
}
?>