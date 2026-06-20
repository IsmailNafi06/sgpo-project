package sgpo.services;

import java.util.Map;

public interface AuthService {
    String authenticate(String username, String password);

    Map<String, String> changePassword(String username, String oldPassword, String newPassword);

    void createAdmin(String username, String password);
}
