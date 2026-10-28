-- Profile picture for every account (doctors keep using doctors.photo_url, which is their public profile photo)
ALTER TABLE users
    ADD COLUMN avatar_path VARCHAR(500) NULL AFTER phone;
