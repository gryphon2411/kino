package com.kino.auth_service.customuser;

import com.kino.commons.security.CustomUser;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

public class CustomUserDetailsService implements UserDetailsService {
    private final CustomUserRepository userRepository;

    public CustomUserDetailsService(CustomUserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    @Cacheable("users")
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        CustomUser customUser = this.userRepository.findCustomUserByUsername(username);
        if (customUser == null) {
            throw new UsernameNotFoundException("Username '" + username + "' not found");
        }
        return customUser;
    }
}
