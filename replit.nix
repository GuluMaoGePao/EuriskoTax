{ pkgs, ... }: {
  deps = [
    pkgs.nodejs
    pkgs.npm
  ];
  env = {
    NODE_ENV = "production";
  };
}
