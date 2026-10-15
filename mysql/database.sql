use annaseva;

 

SELECT id, email
FROM app_users
WHERE email = 'akka@gmail.com';


SELECT COUNT(*) AS total_users
FROM app_users;

SELECT email
FROM app_users
WHERE email = 'akka@gmail.com';

show tables;

select * from fps_shops;

select * from profiles;








SELECT
    sk.id AS shopkeeper_id,
    sk.user_id,
    au.email,
    p.full_name AS shopkeeper_name,
    p.mobile_number,
    fs.shop_code,
    fs.shop_name
FROM shopkeepers sk
INNER JOIN app_users au
    ON au.id = sk.user_id
LEFT JOIN profiles p
    ON p.id = au.id
LEFT JOIN fps_shops fs
    ON fs.id = sk.fps_id
ORDER BY p.full_name;


SELECT * FROM fps_shops;


SELECT COUNT(*) AS total_shopkeepers
FROM shopkeepers;

SELECT id, email, created_at
FROM app_users
WHERE id IN (
    SELECT user_id FROM shopkeepers
);





SELECT
    p.full_name,
    au.email,
    p.mobile_number,
    fs.shop_name,
    fs.shop_code
FROM shopkeepers sk
JOIN app_users au ON au.id = sk.user_id
LEFT JOIN profiles p ON p.id = au.id
LEFT JOIN fps_shops fs ON fs.id = sk.fps_id;





SELECT au.id, au.email, sk.id AS shopkeeper_id
FROM app_users au
JOIN shopkeepers sk ON sk.user_id = au.id
WHERE au.email IN (
    'meena.jadhav.fps04@gmail.com',
    'ramesh.patil.fps01@gmail.com',
    'sunita.pawar.fps002@gmail.com',
    'vijay.shinde.fps03@gmail.com'
);






START TRANSACTION;

DELETE FROM app_users
WHERE email IN (
    'meena.jadhav.fps04@gmail.com',
    'ramesh.patil.fps01@gmail.com',
    'sunita.pawar.fps002@gmail.com',
    'vijay.shinde.fps03@gmail.com'
);

SELECT COUNT(*) AS remaining_shopkeepers
FROM shopkeepers;

COMMIT;


select * from profiles;



SELECT COUNT(*) AS total_accounts
FROM app_users;



SELECT COUNT(*) AS total_shopkeepers
FROM shopkeepers;




SELECT COUNT(*) AS total_shops
FROM fps_shops;

SELECT shop_id, shop_name, status
FROM fps_shops;



SELECT
    ur.user_id,
    ur.role,
    au.name,
    au.email,
    au.phone
FROM user_roles ur
LEFT JOIN app_users au ON au.id = ur.user_id
WHERE ur.role = 'shopkeeper';